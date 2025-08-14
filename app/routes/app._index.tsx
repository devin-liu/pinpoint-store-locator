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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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

  return json({ appSettings });
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
  const { appSettings } = useLoaderData<typeof loader>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [storeLocatorUrl, setStoreLocatorUrl] = useState(appSettings.storeLocatorUrl || "");

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const isUrlUpdateLoading =
    ["loading", "submitting"].includes(urlUpdateFetcher.state) &&
    urlUpdateFetcher.formMethod === "POST";

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

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const handleUrlUpdate = () => {
    urlUpdateFetcher.submit(
      { intent: "updateStoreLocatorUrl", storeLocatorUrl },
      { method: "POST" }
    );
  };

  const urlData = urlUpdateFetcher.data && "storeLocatorUrl" in urlUpdateFetcher.data ? urlUpdateFetcher.data : null;
  const currentUrl = urlData?.storeLocatorUrl || appSettings.storeLocatorUrl;

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
            value={storeLocatorUrl}
            onChange={setStoreLocatorUrl}
            placeholder="https://yourstore.com/pages/store-locator"
            helpText="Enter the full URL to your store locator page"
            autoComplete="off"
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
