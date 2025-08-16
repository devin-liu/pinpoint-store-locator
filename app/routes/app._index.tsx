import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getGoogleMapsApiKey, getStoreLocatorUrl } from "../metafields.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [googleMapsApiKey, storeLocatorUrl] = await Promise.all([
    getGoogleMapsApiKey(admin),
    getStoreLocatorUrl(admin),
  ]);

  // Set app metafields to enable the store locator embed block and pass config
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

    if (storeLocatorUrl) {
      metafields.push({
        namespace: "app",
        key: "store_locator_url",
        type: "url",
        value: storeLocatorUrl,
      });
    }

    const appUrl = process.env.SHOPIFY_APP_URL || "https://ms-earrings-private-overall.trycloudflare.com";
    metafields.push({
      namespace: "app",
      key: "app_url",
      type: "single_line_text_field",
      value: appUrl,
    });

    await admin.graphql(`
      #graphql
      mutation appInstallationMetafieldsSet($metafields: [AppInstallationMetafieldInput!]!) {
        appInstallationMetafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `, { variables: { metafields } });

  } catch (error) {
    console.error("Error setting app metafield:", error);
  }

  return json({
    googleMapsApiKey,
    storeLocatorUrl,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
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

  return json({
    product: responseJson!.data!.productCreate!.product,
  });
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const { googleMapsApiKey, storeLocatorUrl } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

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

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page>
      <TitleBar title="Store Locator Dashboard">
        <button
          type="button"
          onClick={generateProduct}
        >
          Generate a product
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Welcome to your Store Locator App
                </Text>
                <Text as="p" variant="bodyMd">
                  This dashboard provides an overview of your current store locator configuration.
                  You can manage all settings on the settings page.
                </Text>
                <InlineStack gap="300">
                  <Button
                    as={RemixLink}
                    to="/app/settings"
                    variant="primary"
                  >
                    Go to Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Configuration Status
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Google Maps API Key:</strong> {googleMapsApiKey ? "Configured" : "Not configured"}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Store Locator Page:</strong> {storeLocatorUrl ? <a href={storeLocatorUrl} target="_blank" rel="noopener noreferrer">{storeLocatorUrl}</a> : "Not configured"}
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
