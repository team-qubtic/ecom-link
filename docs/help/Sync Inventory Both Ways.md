# Sync Inventory Both Ways

Two-way sync sends your Framer edits back to the WooCommerce store. A normal sync pulls products into Framer first; two-way sync then collects the edits you made in Framer since the last confirmed sync, shows every change for review, and sends only what you confirm. Nothing is ever written to the store without a review.

[Add Two-Way Sync Screenshot]

## Turn On Two-Way Sync

Two settings unlock write-back, and both are needed.

1. Turn on the **Two-way sync** switch when you connect the store, so your keys are checked for read and write permission. If you enabled the switch with read-only keys, the plugin will tell you when write access is blocked and what to do about it. See [Connections](./Connections.md) for adding keys, upgrading saved keys, and fixing a blocked write path.
2. In the mapping wizard, turn on the **Two-way** switch for each field that should sync back. The switches only unlock for fields the store can receive. Leave a switch off to keep that field one-way, and the plugin will never send it back.

If a **Two-way** switch is on but your keys are read-only, the wizard will say: Two-way sync needs keys with read and write permission. Edit the connection to upgrade your keys, then sync.

[Add Mapping Two-Way Switches Screenshot]

## How A Two-Way Sync Runs

1. On the store card, select **Sync now**. The pull phase runs exactly like a normal sync and brings the store into Framer first.
2. When the pull completes, the plugin compares each two-way field against the snapshot saved by the last confirmed sync. Your Framer edits show up as pending changes.
3. Nothing goes to the store yet. The plugin opens a review window first, and the store is only touched after you confirm.

If the pull pauses or stops early, no changes are sent; fix the pull and run the sync again. If no Framer edits are waiting, the review window is skipped and the report opens directly.

## Review Changes Before Anything Is Sent

The review window is titled **Review Changes** and says: Review the changes that will be sent to your store.

[Add Review Changes Screenshot]

- The summary counts the pending work, such as `3 changes ready to send. 1 conflict to resolve.`
- **Changes to Send** lists every edit waiting for confirmation. Each row shows the field, the value **In your store**, and the value **In Framer**, so the outcome is visible before anything happens.
- Select the confirm button, labeled with the exact count, such as **Send 3 changes to the store**.
- Select **Cancel** to send nothing. The edits stay in Framer and will still be offered on the next sync.

Deleted Framer items are never sent, so deleting a product in Framer does not delete it in the store. Products that exist only in Framer, such as items created by hand, are never sent either.

## Resolve Conflicts

A conflict happens when a field changed in both places since the last sync: one value in the store and a different value in Framer. The plugin will not guess which one wins.

1. In the **Review Changes** window, select **Resolve conflicts**.
2. The **Resolve Conflicts** window explains: These fields changed in both your store and in Framer since the last sync. Choose the value to keep for each field.
3. Each field shows both values. Select **Keep store value** or **Push to store** for each one.
4. The counter tracks progress, such as `2 of 3 conflicts resolved. Unresolved fields keep the store value.`
5. Select **Done** to return to the review window.

Anything you leave unresolved keeps the store value, which is the safe default. In the review table, an unresolved conflict reads `Unresolved. The store value is kept.`, and a resolved one reads `Keeps the store value.` or `Sends the Framer value.`

## Read The Store Changes Report

After you confirm, the send runs and the report gains a **Store Changes** section:

- `2 products written to the store.` counts the products the store accepted.
- When conflicts were kept on the store side: `1 field kept the store value.`
- A product that fails to save is listed with its reason. When the keys lack write permission, the report says: Your API key does not allow changes to the store. Create a key with read and write permission and reconnect.
- Rarely, the store accepts a change but the local history cannot be updated. The report then says: Your store changes were saved, but the local change history could not be updated. The next sync may offer the same change again. Confirming the repeat send is safe; it writes the same values.

If checking for Framer edits fails outright, nothing is sent and the report notes: Two-way changes could not be checked, so nothing was sent to the store. The next sync will try the check again.

## What Syncs Back

Only the fields with a **Two-way** switch on, limited to what the store can receive. For WooCommerce that is:

- **Name**, **Slug**, **Status**, **Description**, **Short description**, **SKU**
- **Regular price**, **Sale price**, **Stock quantity**, **Stock status**

Images, categories, tags, variants, and permalinks stay one-way for now. A row without a name is labeled with its store id, such as `Product 12`.

## Why A Confirmed Change Is Offered Only Once

Every confirmed write refreshes the saved snapshot for that field, so the same edit is not offered twice. A snapshot only updates after the store confirms the write, so a failed send reappears on the next sync until it succeeds or the Framer value changes back.

## What To Read Next

- [Connections](./Connections.md) for key scopes, upgrading keys, and the companion plugin.
- [Sync Products](./Sync%20Products.md) for the pull side of the flow.
- [Getting Started](./Getting%20Started.md) for the full first-run walkthrough.

## Video tutorial

[Add Two-Way Sync Video Tutorial]
