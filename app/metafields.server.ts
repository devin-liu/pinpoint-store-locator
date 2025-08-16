import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const GOOGLE_MAPS_NAMESPACE = "store_locator";
const GOOGLE_MAPS_KEY = "google_maps_api_key";

/**
 * Get the Google Maps API key from merchant-owned metafields
 */
export async function getGoogleMapsApiKey(admin: AdminApiContext): Promise<string | null> {
  try {
    console.log(`Debug: Querying metafield ${GOOGLE_MAPS_NAMESPACE}.${GOOGLE_MAPS_KEY}`);
    
    const response = await admin.graphql(`
      #graphql
      query getGoogleMapsApiKey {
        shop {
          metafield(namespace: "${GOOGLE_MAPS_NAMESPACE}", key: "${GOOGLE_MAPS_KEY}") {
            value
          }
        }
      }
    `);

    const data = await response.json();
    console.log("Debug: Metafield query response:", JSON.stringify(data, null, 2));
    
    const apiKey = data?.data?.shop?.metafield?.value || null;
    console.log("Debug: Extracted API key:", apiKey ? "***REDACTED***" : "null");
    
    return apiKey;
  } catch (error) {
    console.error("Error getting Google Maps API key from metafields:", error);
    return null;
  }
}

/**
 * Set the Google Maps API key in merchant-owned metafields
 */
export async function setGoogleMapsApiKey(admin: AdminApiContext, apiKey: string): Promise<boolean> {
  try {
    // First get the shop ID
    const shopResponse = await admin.graphql(`
      #graphql
      query getShopId {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopId = shopData?.data?.shop?.id;

    if (!shopId) {
      console.error("Could not get shop ID");
      return false;
    }

    const response = await admin.graphql(`
      #graphql
      mutation setGoogleMapsApiKey($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            namespace: GOOGLE_MAPS_NAMESPACE,
            key: GOOGLE_MAPS_KEY,
            type: "single_line_text_field",
            value: apiKey,
            ownerId: shopId
          }
        ]
      }
    });

    const data = await response.json();
    
    if (data?.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Error setting Google Maps API key:", data.data.metafieldsSet.userErrors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error setting Google Maps API key in metafields:", error);
    return false;
  }
}

/**
 * Delete the Google Maps API key from merchant-owned metafields
 */
export async function deleteGoogleMapsApiKey(admin: AdminApiContext): Promise<boolean> {
  try {
    // First get the metafield ID
    const getResponse = await admin.graphql(`
      #graphql
      query getGoogleMapsApiKeyId {
        shop {
          metafield(namespace: "${GOOGLE_MAPS_NAMESPACE}", key: "${GOOGLE_MAPS_KEY}") {
            id
          }
        }
      }
    `);

    const getData = await getResponse.json();
    const metafieldId = getData?.data?.shop?.metafield?.id;

    if (!metafieldId) {
      return true; // Already deleted or doesn't exist
    }

    const deleteResponse = await admin.graphql(`
      #graphql
      mutation deleteGoogleMapsApiKey($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          id: metafieldId
        }
      }
    });

    const deleteData = await deleteResponse.json();
    
    if (deleteData?.data?.metafieldDelete?.userErrors?.length > 0) {
      console.error("Error deleting Google Maps API key:", deleteData.data.metafieldDelete.userErrors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting Google Maps API key from metafields:", error);
    return false;
  }
}