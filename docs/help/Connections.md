# Connections

Your connection is the bridge between one WooCommerce store and this Framer project. This page explains how to add a connection, what the labels mean, and what to do when the browser blocks the first attempt.

[Add Connections Overview Screenshot]

## Connect A Store

1. Select **Connect store** on the dashboard.
2. Enter your **Store URL**, such as `https://store.example.com`.
3. Enter your **Consumer key** and **Consumer secret**.
4. Select **Connect store**.

The plugin will normalize the address, check the keys against your store, and save the connection when everything passes. Nothing is saved if the check fails.

[Add Connect Store Form Screenshot]

A note on addresses: they must use HTTPS. If you type an address without a protocol, `https://` will be added automatically. Plain `http://` addresses are refused except for local development addresses like `http://localhost:8080`.

## Create API Keys In WooCommerce

1. Open your WordPress admin and go to WooCommerce, then Settings, then Advanced, then REST API.
2. Select **Add key**.
3. Choose a description, pick your user, and set permissions.
4. Select **Generate API key** and copy the consumer key and consumer secret shown on the screen.

Read permission is enough for one-way syncing. Keys are shown only once, so store them somewhere safe right away.

## Why Your Keys Look Hidden

Saved keys are displayed masked, like `ck_••••1234`. The full values are kept for the plugin and never shown on screen. When you edit a connection, leave the key fields empty to keep the stored values.

## Two-Way Sync Keys

The **Two-way sync** switch asks the plugin to also send your Framer edits back to the store. For that, your API keys need read and write permission. Every outgoing change will be shown to you for review before anything is sent to your store.

If you enable the switch with read-only keys, the connection check will still pass for reading, but the plugin will tell you when write access is blocked and what to do about it.

## If The Browser Blocks The Connection

Some stores reject requests that come straight from a browser window. When that happens, the plugin will say so and show a short set of steps:

1. Install the free Ecom-Link companion plugin on your WordPress site.
2. Paste the **Companion plugin URL** into the connection form.
3. Select **Try again**.

The companion plugin lets your store accept requests from the plugin while staying closed to everyone else. As an alternative, your host can allow the plugin origin for you.

## If Two-Way Sync Is Blocked

With two-way sync enabled, the plugin also checks whether your store accepts browser updates. When that check fails, a **Two-Way Sync Blocked** message will appear after saving. Your connection still works for one-way syncing, and installing the companion plugin will open the write path.

## If CMS Editing Is Blocked

The plugin can only write to CMS collections when your Framer account may edit this project. Plugins can do only what the user can, so an account with view-only access cannot save connections or sync products, even with valid store keys.

When that happens, a **CMS Editing Blocked** message appears and the save and connection actions stay disabled. Open the plugin with an account that has edit access to the project, or ask the project owner to grant your account edit permission. The message clears as soon as the permission is granted.

## Use More Than One Store

You can connect several stores to the same project. Each card on the dashboard is one store, and exactly one is active at a time. Select **Set active** on any card to switch. Syncing and validation always run against the active store.

[Add Multiple Stores Screenshot]

## Check, Edit, Or Remove A Connection

- **Revalidate** runs the connection check again and updates the status label.
- **Edit** reopens the form so you can change the address, the keys, or the two-way setting.
- **Disconnect** removes the stored keys and the companion plugin URL for that store. Products already synced stay in your CMS collection, and you can reconnect the same store at any time.

Removing a connection will also ask you to confirm first, so nothing disappears by accident.

[Add Disconnect Screenshot]

## Where Your Keys Are Stored

Connection details are stored inside this Framer project, in an internal CMS collection named Ecom-Link Internal. Anyone with CMS access to the project can open that collection and see the stored values, so share project access carefully. Disconnecting a store removes its keys completely.

## What To Read Next

- [Sync Inventory Both Ways](./Sync%20Inventory%20Both%20Ways.md) for the write-back flow, change review, and conflicts.
- [Getting Started](./Getting%20Started.md) for the full first-run walkthrough.

## Video tutorial

[Add Connections Video Tutorial]
