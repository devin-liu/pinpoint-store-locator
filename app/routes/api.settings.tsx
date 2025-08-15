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

  const settings = await db.appSettings.findUnique({
    where: { shop },
    select: {
      googleMapsApiKey: true,
      storeLocatorUrl: true,
    },
  });

  if (!settings) {
    const response = json({ error: "Settings not found for this shop" }, { status: 404 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }

  const response = json(settings);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};
