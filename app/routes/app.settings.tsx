import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  FormLayout,
  TextField,
  Toast,
  Frame,
  BlockStack,
  Text,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "$app:google_maps";
const METAFIELD_KEY = "api_key";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getShopMetafield($ownerId: ID!) {
      shop(id: $ownerId) {
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }`,
    {
      variables: {
        ownerId: session.id,
      },
    }
  );

  const responseJson = await response.json();
  const googleMapsApiKey = responseJson.data.shop.metafield?.value || "";

  return json({ googleMapsApiKey });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const googleMapsApiKey = formData.get("googleMapsApiKey") as string;

  // 1. Create the metafield definition
  await admin.graphql(
    `#graphql
    mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        definition: {
          name: "Google Maps API Key",
          key: METAFIELD_KEY,
          description: "API key for Google Maps integration",
          type: "single_line_text_field",
          ownerType: "SHOP",
          namespace: METAFIELD_NAMESPACE,
        },
      },
    }
  );

  // 2. Set the metafield value
  const response = await admin.graphql(
    `#graphql
    mutation metaflieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "single_line_text_field",
            value: googleMapsApiKey,
            ownerId: session.id,
          },
        ],
      },
    }
  );

  const responseJson = await response.json();

  return json({
    success: responseJson.data.metafieldsSet.userErrors.length === 0,
    errors: responseJson.data.metafieldsSet.userErrors,
  });
};

export default function Settings() {
  const { googleMapsApiKey: initialApiKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(initialApiKey);
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("googleMapsApiKey", googleMapsApiKey);

    fetcher.submit(formData, { method: "POST" });
    setShowToast(true);
  }, [googleMapsApiKey, fetcher]);

  const isLoading = fetcher.state === "submitting";

  const toastMarkup = showToast ? (
    <Toast
      content="Settings saved successfully"
      onDismiss={() => setShowToast(false)}
    />
  ) : null;

  return (
    <Frame>
      <Page>
        <TitleBar title="App Settings" />

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Google Maps Configuration
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure your Google Maps API key to enable geocoding and map features
                  for your store locator.
                </Text>

                <Divider />

                <FormLayout>
                  <TextField
                    label="Google Maps API Key"
                    value={googleMapsApiKey}
                    onChange={setGoogleMapsApiKey}
                    autoComplete="off"
                    type="password"
                    helpText="Enter your Google Maps API key. This will be used for geocoding addresses and displaying maps."
                  />

                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    loading={isLoading}
                  >
                    Save Settings
                  </Button>
                </FormLayout>

                <Divider />

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Getting a Google Maps API Key
                  </Text>
                  <Text as="p" variant="bodyMd">
                    To get a Google Maps API key:
                  </Text>
                  <Text as="ol">
                    <li>1. Go to the Google Cloud Console</li>
                    <li>2. Create a new project or select an existing one</li>
                    <li>3. Enable the Maps JavaScript API and Geocoding API</li>
                    <li>4. Create credentials (API key)</li>
                    <li>5. Restrict the API key to your domain for security</li>
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    <a
                      href="https://developers.google.com/maps/documentation/javascript/get-api-key"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View detailed instructions →
                    </a>
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      {toastMarkup}
    </Frame>
  );
}