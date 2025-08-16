import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit } from "@remix-run/react";
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
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getGoogleMapsApiKey,
  setGoogleMapsApiKey,
  getStoreLocatorUrl,
  setStoreLocatorUrl,
} from "../metafields.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const [googleMapsApiKey, storeLocatorUrl] = await Promise.all([
    getGoogleMapsApiKey(admin),
    getStoreLocatorUrl(admin),
  ]);

  return json({
    googleMapsApiKey,
    storeLocatorUrl,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const googleMapsApiKey = formData.get("googleMapsApiKey") as string;
  const storeLocatorUrl = formData.get("storeLocatorUrl") as string;
  const shop = formData.get("shop") as string;

  let success = true;
  if (googleMapsApiKey !== null) {
    success = success && await setGoogleMapsApiKey(admin, googleMapsApiKey);
  }
  if (storeLocatorUrl !== null) {
    const fullUrl = `https://${shop}/pages/${storeLocatorUrl}`;
    success = success && await setStoreLocatorUrl(admin, fullUrl);
  }

  if (!success) {
    return json({ success: false, error: "Failed to save settings" }, { status: 500 });
  }

  return json({ success: true });
};

export default function Settings() {
  const { googleMapsApiKey: initialApiKey, storeLocatorUrl: initialStoreLocatorUrl, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const appBridge = useAppBridge();

  const getPagePathFromUrl = (url: string) => {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path.startsWith("/pages/")) {
        return path.substring(7);
      }
      return "";
    } catch {
      return "";
    }
  };

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(initialApiKey || "");
  const [storeLocatorUrl, setStoreLocatorUrl] = useState(getPagePathFromUrl(initialStoreLocatorUrl || ""));
  
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      appBridge.toast.show("Settings saved successfully");
    }
  }, [fetcher.data, appBridge]);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("googleMapsApiKey", googleMapsApiKey);
    formData.append("storeLocatorUrl", storeLocatorUrl);
    formData.append("shop", shop);
    
    submit(formData, { method: "POST" });
  }, [googleMapsApiKey, storeLocatorUrl, shop, submit]);

  return (
    <Frame>
      <Page>
        <TitleBar title="App Settings">
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isLoading}
          >
            Save Settings
          </Button>
        </TitleBar>
        
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Store Locator Page
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Specify the URL of the page where your store locator is embedded.
                  This helps the app link correctly to your store locator.
                </Text>

                <Divider />

                <FormLayout>
                  <TextField
                    label="Store Locator Page URL"
                    value={storeLocatorUrl}
                    onChange={setStoreLocatorUrl}
                    autoComplete="off"
                    helpText="Enter the page handle (e.g., 'store-locator')."
                    prefix={`https://${shop}/pages/`}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Google Maps Configuration
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure your Google Maps API key to enable geocoding and map features 
                  for your store locator. This API key is stored securely in your shop's metafields.
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
                </FormLayout>

                <Divider />

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Getting a Google Maps API Key
                  </Text>
                  <Text as="p" variant="bodyMd">
                    To get a Google Maps API key:
                  </Text>
                  <Text as="ol" variant="bodyMd">
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
    </Frame>
  );
}