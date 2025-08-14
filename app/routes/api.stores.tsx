import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    if (!shop) {
      const response = json({ error: "Shop parameter is required" }, { status: 400 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
      return response;
    }
    
    // Try to match both the full domain and the subdomain
    const shopSubdomain = shop.replace(/\.myshopify\.com$/, "");
    
    // Fetch stores for the shop - try both full domain and subdomain
    const stores = await prisma.store.findMany({
      where: {
        OR: [
          { shop: shop },              // Try full domain first
          { shop: shopSubdomain },     // Then try subdomain
        ]
      },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    const response = json(stores);
    
    // Add CORS headers to allow the embed block to access this API
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    
    return response;
  } catch (error) {
    console.error("Error fetching stores:", error);
    const response = json({ error: "Internal server error" }, { status: 500 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  }
};

export const options = async ({ request }: LoaderFunctionArgs) => {
  const response = new Response(null, { status: 200 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
};