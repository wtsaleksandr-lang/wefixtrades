-- assistant_messages.attachments: JSONB array of image references the user
-- attached to this message (mobile Ask tab). Shape:
--   [{ "assetId": "assistant-uploads/<userId>/<uuid>.<ext>",
--      "mimeType": "image/jpeg",
--      "sizeBytes": 245678 }]
-- Null for messages with no attachments. Read at thread-load time and
-- transformed into signed-URL objects for the mobile client.

ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS attachments JSONB;
