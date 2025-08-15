import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    const response = json({ error: "Shop parameter is required" }, { status: 400 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }

  let settings = await db.appSettings.findUnique({
    where: { shop },
    select: {
      googleMapsApiKey: true,
      storeLocatorUrl: true,
    },
  });

  // If no settings are found, provide a default configuration.
  // This allows the app to function before it's configured by the merchant.
  if (!settings) {
    settings = {
      googleMapsApiKey: null,
      storeLocatorUrl: process.env.SHOPIFY_APP_URL || null,
    };
  }

  const response = json(settings);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};
