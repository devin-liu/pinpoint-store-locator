import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  Modal,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getGoogleMapsApiKey, setGoogleMapsApiKey } from "../metafields.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  let appSettings = await prisma.appSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!appSettings) {
    appSettings = await prisma.appSettings.create({
      data: {
        shop: session.shop,
      },
    });
  }

  // Get Google Maps API key from merchant-owned metafields
  const googleMapsApiKey = await getGoogleMapsApiKey(admin);

  // Set app metafields to enable the store locator embed block and pass Google Maps API key
  try {
    const metafields = [
      {
        namespace: "availability",
        key: "store_locator",
        type: "boolean",
        value: "true",
      },
    ];

    // Add Google Maps API key metafield if available from merchant metafields
    if (googleMapsApiKey) {
      metafields.push({
        namespace: "app",
        key: "google_maps_api_key",
        type: "single_line_text_field",
        value: googleMapsApiKey,
      });
    }

    // Add app URL metafield for API calls
    metafields.push({
      namespace: "app",
      key: "app_url",
      type: "single_line_text_field",
      value: process.env.SHOPIFY_APP_URL || "https://adjustments-chart-kai-interview.trycloudflare.com",
    });

    await admin.graphql(`
      #graphql
      mutation appInstallationMetafieldsSet($metafields: [AppInstallationMetafieldInput!]!) {
        appInstallationMetafieldsSet(metafields: $metafields) {
          appInstallationMetafields {
            id
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { metafields },
    });
  } catch (error) {
    console.error("Error setting app metafield:", error);
  }

  return json({ appSettings: { ...appSettings, googleMapsApiKey }, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateStoreLocatorUrl") {
    const storeLocatorUrl = formData.get("storeLocatorUrl") as string;

    await prisma.appSettings.upsert({
      where: { shop: session.shop },
      update: { storeLocatorUrl },
      create: { shop: session.shop, storeLocatorUrl },
    });

    return json({ success: true, storeLocatorUrl });
  }

  if (intent === "updateGoogleMapsApiKey") {
    const googleMapsApiKey = formData.get("googleMapsApiKey") as string;

    // Save to merchant-owned metafields instead of database
    const success = await setGoogleMapsApiKey(admin, googleMapsApiKey);
    
    if (!success) {
      return json({ success: false, error: "Failed to save API key" }, { status: 500 });
    }

    // Update the app installation metafield with the new API key for theme access
    try {
      const metafields = [
        {
          namespace: "availability",
          key: "store_locator",
          type: "boolean",
          value: "true",
        },
      ];

      if (googleMapsApiKey) {
        metafields.push({
          namespace: "app",
          key: "google_maps_api_key",
          type: "single_line_text_field",
          value: googleMapsApiKey,
        });
      }

      // Always add app URL metafield
      metafields.push({
        namespace: "app",
        key: "app_url",
        type: "single_line_text_field",
        value: process.env.SHOPIFY_APP_URL || "https://adjustments-chart-kai-interview.trycloudflare.com",
      });

      await admin.graphql(`
        #graphql
        mutation appInstallationMetafieldsSet($metafields: [AppInstallationMetafieldInput!]!) {
          appInstallationMetafieldsSet(metafields: $metafields) {
            appInstallationMetafields {
              id
              key
              namespace
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { metafields },
      });
    } catch (error) {
      console.error("Error updating Google Maps API key metafield:", error);
    }

    return json({ success: true, googleMapsApiKey });
  }

  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson!.data!.productCreate!.product,
    variant:
      variantResponseJson!.data!.productVariantsBulkUpdate!.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const urlUpdateFetcher = useFetcher<typeof action>();
  const apiKeyUpdateFetcher = useFetcher<typeof action>();
  const { appSettings, shop } = useLoaderData<typeof loader>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  
  // Extract page path from existing URL or default to empty
  const getPagePathFromUrl = (url: string) => {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path.startsWith("/pages/")) {
        return path.substring(7); // Remove "/pages/" prefix
      }
      return "";
    } catch {
      return "";
    }
  };
  
  const [pagePath, setPagePath] = useState(getPagePathFromUrl(appSettings.storeLocatorUrl || ""));
  const [apiKey, setApiKey] = useState(appSettings.googleMapsApiKey || "");
  const shopDomain = `https://${shop}`;
  const fullStoreLocatorUrl = pagePath ? `${shopDomain}/pages/${pagePath}` : "";

  const shopify = useAppBridge();
  const isUrlUpdateLoading =
    ["loading", "submitting"].includes(urlUpdateFetcher.state) &&
    urlUpdateFetcher.formMethod === "POST";
  const isApiKeyUpdateLoading =
    ["loading", "submitting"].includes(apiKeyUpdateFetcher.state) &&
    apiKeyUpdateFetcher.formMethod === "POST";

  const productData = fetcher.data && "product" in fetcher.data ? fetcher.data : null;
  const productId = productData?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);

  useEffect(() => {
    const urlData = urlUpdateFetcher.data && "success" in urlUpdateFetcher.data ? urlUpdateFetcher.data : null;
    if (urlData?.success) {
      shopify.toast.show("Store locator URL updated successfully");
      setIsModalOpen(false);
    }
  }, [urlUpdateFetcher.data, shopify]);

  useEffect(() => {
    const apiKeyData = apiKeyUpdateFetcher.data && "success" in apiKeyUpdateFetcher.data ? apiKeyUpdateFetcher.data : null;
    if (apiKeyData?.success) {
      shopify.toast.show("Google Maps API key updated successfully");
      setIsApiKeyModalOpen(false);
    }
  }, [apiKeyUpdateFetcher.data, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const handleUrlUpdate = () => {
    urlUpdateFetcher.submit(
      { intent: "updateStoreLocatorUrl", storeLocatorUrl: fullStoreLocatorUrl },
      { method: "POST" }
    );
  };

  const handleApiKeyUpdate = () => {
    apiKeyUpdateFetcher.submit(
      { intent: "updateGoogleMapsApiKey", googleMapsApiKey: apiKey },
      { method: "POST" }
    );
  };

  const urlData = urlUpdateFetcher.data && "storeLocatorUrl" in urlUpdateFetcher.data ? urlUpdateFetcher.data : null;
  const currentUrl = urlData?.storeLocatorUrl || appSettings.storeLocatorUrl;
  
  const apiKeyData = apiKeyUpdateFetcher.data && "googleMapsApiKey" in apiKeyUpdateFetcher.data ? apiKeyUpdateFetcher.data : null;
  const currentApiKey = apiKeyData?.googleMapsApiKey || appSettings.googleMapsApiKey;

  return (
    <Page>
      <TitleBar title="Remix app template">
        <button variant="primary" onClick={generateProduct}>
          Generate a product
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Store Locator
                  </Text>
                  <Text variant="bodyMd" as="p">
                    {currentUrl ? `Current page: ${currentUrl}` : "No store locator page configured"}
                  </Text>
                  <InlineStack gap="300">
                    {currentUrl && (
                      <Button
                        url={currentUrl}
                        target="_blank"
                        variant="primary"
                      >
                        View page
                      </Button>
                    )}
                    <Button onClick={() => setIsModalOpen(true)}>
                      Edit URL
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Google Maps Configuration
                  </Text>
                  <Text variant="bodyMd" as="p">
                    {currentApiKey ? "Google Maps API key is configured" : "Google Maps API key is not configured"}
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => setIsApiKeyModalOpen(true)}>
                      {currentApiKey ? "Update API Key" : "Add API Key"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Store Locator URL"
        primaryAction={{
          content: "Save",
          onAction: handleUrlUpdate,
          loading: isUrlUpdateLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <TextField
            label="Store Locator URL"
            value={pagePath}
            onChange={setPagePath}
            placeholder="store-locator"
            prefix={`${shopDomain}/pages/`}
            helpText="Enter the page name after /pages/ - your store domain is automatically included"
            autoComplete="off"
          />
        </Modal.Section>
      </Modal>
      <Modal
        open={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        title="Configure Google Maps API Key"
        primaryAction={{
          content: "Save",
          onAction: handleApiKeyUpdate,
          loading: isApiKeyUpdateLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsApiKeyModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <TextField
            label="Google Maps API Key"
            value={apiKey}
            onChange={setApiKey}
            placeholder="AIzaSy..."
            helpText="Enter your Google Maps API key to enable location search and autocomplete features"
            autoComplete="off"
            type="password"
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
