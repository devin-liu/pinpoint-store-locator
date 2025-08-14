import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  DataTable,
  Modal,
  FormLayout,
  TextField,
  ButtonGroup,
  Toast,
  Frame,
  EmptyState,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const stores = await db.store.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ stores });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "create") {
    const name = formData.get("name") as string;
    const address = formData.get("address") as string;
    const latitude = formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : null;
    const longitude = formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : null;
    const productId = formData.get("productId") as string || null;
    const collectionId = formData.get("collectionId") as string || null;

    const store = await db.store.create({
      data: {
        name,
        address,
        latitude,
        longitude,
        productId,
        collectionId,
        shop: session.shop,
      },
    });

    return json({ success: true, store });
  }

  if (action === "update") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const address = formData.get("address") as string;
    const latitude = formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : null;
    const longitude = formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : null;
    const productId = formData.get("productId") as string || null;
    const collectionId = formData.get("collectionId") as string || null;

    const store = await db.store.update({
      where: { id, shop: session.shop },
      data: {
        name,
        address,
        latitude,
        longitude,
        productId,
        collectionId,
      },
    });

    return json({ success: true, store });
  }

  if (action === "delete") {
    const id = formData.get("id") as string;
    
    await db.store.delete({
      where: { id, shop: session.shop },
    });

    return json({ success: true });
  }

  return json({ success: false });
};

export default function Stores() {
  const { stores } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const submit = useSubmit();
  const shopify = useAppBridge();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    productId: "",
    collectionId: "",
  });
  const [showToast, setShowToast] = useState(false);
  const [resourcePickerType, setResourcePickerType] = useState<"product" | "collection">("product");

  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      address: "",
      latitude: "",
      longitude: "",
      productId: "",
      collectionId: "",
    });
    setEditingStore(null);
  }, []);

  const openModal = useCallback((store = null) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        name: store.name || "",
        address: store.address || "",
        latitude: store.latitude?.toString() || "",
        longitude: store.longitude?.toString() || "",
        productId: store.productId || "",
        collectionId: store.collectionId || "",
      });
    } else {
      resetForm();
    }
    setModalOpen(true);
  }, [resetForm]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetForm();
  }, [resetForm]);

  const handleSubmit = useCallback(() => {
    const data = new FormData();
    data.append("action", editingStore ? "update" : "create");
    if (editingStore) {
      data.append("id", editingStore.id);
    }
    data.append("name", formData.name);
    data.append("address", formData.address);
    data.append("latitude", formData.latitude);
    data.append("longitude", formData.longitude);
    data.append("productId", formData.productId);
    data.append("collectionId", formData.collectionId);

    submit(data, { method: "POST" });
    closeModal();
    setShowToast(true);
  }, [editingStore, formData, submit, closeModal]);

  const handleDelete = useCallback((store: any) => {
    if (confirm(`Are you sure you want to delete "${store.name}"?`)) {
      const data = new FormData();
      data.append("action", "delete");
      data.append("id", store.id);
      submit(data, { method: "POST" });
      setShowToast(true);
    }
  }, [submit]);

  const handleResourceSelection = useCallback((selection: any) => {
    if (resourcePickerType === "product" && selection.length > 0) {
      setFormData(prev => ({ ...prev, productId: selection[0].id, collectionId: "" }));
    } else if (resourcePickerType === "collection" && selection.length > 0) {
      setFormData(prev => ({ ...prev, collectionId: selection[0].id, productId: "" }));
    }
  }, [resourcePickerType]);

  const openResourcePicker = useCallback((type: "product" | "collection") => {
    setResourcePickerType(type);
    shopify.resourcePicker({
      type: type === "product" ? "product" : "collection",
      multiple: false,
    }).then((selection: any) => {
      if (selection && selection.length > 0) {
        handleResourceSelection(selection);
      }
    });
  }, [shopify, handleResourceSelection]);

  const rows = stores.map((store) => [
    store.name,
    store.address,
    store.latitude && store.longitude ? `${store.latitude}, ${store.longitude}` : "-",
    store.productId ? `Product: ${store.productId.replace('gid://shopify/Product/', '')}` : 
    store.collectionId ? `Collection: ${store.collectionId.replace('gid://shopify/Collection/', '')}` : "-",
    <ButtonGroup key={store.id}>
      <Button size="slim" onClick={() => openModal(store)}>Edit</Button>
      <Button size="slim" tone="critical" onClick={() => handleDelete(store)}>Delete</Button>
    </ButtonGroup>
  ]);

  const toastMarkup = showToast ? (
    <Toast content="Store updated successfully" onDismiss={() => setShowToast(false)} />
  ) : null;

  return (
    <Frame>
      <Page>
        <TitleBar title="Store Locator Management">
          <Button variant="primary" onClick={() => openModal()}>
            Add Store
          </Button>
        </TitleBar>
        
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Store Locations
                  </Text>
                  <Button variant="primary" onClick={() => openModal()}>
                    Add Store
                  </Button>
                </InlineStack>
                
                {stores.length === 0 ? (
                  <EmptyState
                    heading="No stores yet"
                    action={{
                      content: "Add your first store",
                      onAction: () => openModal(),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Start by adding your first store location to help customers find you.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Store Name", "Address", "Coordinates", "Linked Product/Collection", "Actions"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={editingStore ? "Edit Store" : "Add New Store"}
          primaryAction={{
            content: editingStore ? "Update Store" : "Add Store",
            onAction: handleSubmit,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: closeModal,
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Store Name"
                value={formData.name}
                onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                autoComplete="off"
              />
              <TextField
                label="Address"
                value={formData.address}
                onChange={(value) => setFormData(prev => ({ ...prev, address: value }))}
                autoComplete="off"
                multiline={2}
              />
              <FormLayout.Group>
                <TextField
                  label="Latitude"
                  value={formData.latitude}
                  onChange={(value) => setFormData(prev => ({ ...prev, latitude: value }))}
                  autoComplete="off"
                  type="number"
                  step="any"
                />
                <TextField
                  label="Longitude"
                  value={formData.longitude}
                  onChange={(value) => setFormData(prev => ({ ...prev, longitude: value }))}
                  autoComplete="off"
                  type="number"
                  step="any"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <div>
                  <Text as="h3" variant="headingXs">Link to Product</Text>
                  <ButtonGroup>
                    <Button onClick={() => openResourcePicker("product")}>
                      {formData.productId ? "Change Product" : "Select Product"}
                    </Button>
                    {formData.productId && (
                      <Button onClick={() => setFormData(prev => ({ ...prev, productId: "" }))}>
                        Clear
                      </Button>
                    )}
                  </ButtonGroup>
                  {formData.productId && (
                    <Text as="p" variant="bodyXs" tone="subdued">
                      Selected: {formData.productId.replace('gid://shopify/Product/', '')}
                    </Text>
                  )}
                </div>
                <div>
                  <Text as="h3" variant="headingXs">Link to Collection</Text>
                  <ButtonGroup>
                    <Button onClick={() => openResourcePicker("collection")}>
                      {formData.collectionId ? "Change Collection" : "Select Collection"}
                    </Button>
                    {formData.collectionId && (
                      <Button onClick={() => setFormData(prev => ({ ...prev, collectionId: "" }))}>
                        Clear
                      </Button>
                    )}
                  </ButtonGroup>
                  {formData.collectionId && (
                    <Text as="p" variant="bodyXs" tone="subdued">
                      Selected: {formData.collectionId.replace('gid://shopify/Collection/', '')}
                    </Text>
                  )}
                </div>
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>

      </Page>
      {toastMarkup}
    </Frame>
  );
}