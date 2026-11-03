# Getting Started

Ecom-Link connects your WooCommerce store to Framer and keeps your product data in Framer CMS collections. This page walks you through the first steps: opening the plugin, connecting your store, and checking that the connection is healthy.

[Add Getting Started Hero Screenshot]

## What You Need Before Starting

- The web address of your WooCommerce store, such as `https://store.example.com`. The address must use HTTPS.
- A pair of REST API keys from WooCommerce. Keys with read permission are enough to get started.
- The Framer project that will hold your products.

If you do not have API keys yet, the [Connections](./Connections.md) page shows exactly where to generate them in WooCommerce.

## Step 1: Open The Plugin

Open your Framer project and select Ecom-Link from the plugins menu. The plugin window will open on the right side of the canvas.

[Add Open Plugin Screenshot]

## Step 2: Connect Your Store

Select **Connect store**. A form will appear asking for your store address, your consumer key, and your consumer secret. Fill in the three fields and select **Connect store** again. The plugin will contact your store, check the keys, and save the connection.

If anything is wrong, a clear message will tell you what to fix. The [Connections](./Connections.md) page explains every message, including the browser restriction some stores hit on the first try.

[Add First Connection Screenshot]

## Step 3: Check The Connection

After connecting, your dashboard will show the store with a status label:

- **Connected** means the keys work and the store answered.
- **Connection failed** means the last check did not pass. Select **Revalidate** to try again after fixing the cause.
- **Not checked yet** means no check has run.

Your keys will always appear masked, like `ck_••••1234`. That is normal and keeps your secrets off the screen.

[Add Connection Status Screenshot]

## What Comes Next

Once your store is connected, product syncing is the next step. Selecting **Start sync** on the store card will open the mapping wizard and bring in your catalog. The [Sync Products](./Sync%20Products.md) page walks through the whole flow, including progress, retries, and safety limits.

## What To Read Next

- [Connections](./Connections.md) for adding, editing, checking, switching, and removing stores.
- [Sync Products](./Sync%20Products.md) for the first import and every sync after it.

## Video tutorial

[Add Getting Started Video Tutorial]
