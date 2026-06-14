const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function uploadGeneratedImage(filePath, destinationPath) {
  const client = getSupabaseClient();
  const bucket = process.env.SUPABASE_BUCKET || "generated-images";

  if (!client) {
    return {
      uploaded: false,
      reason: "Supabase variables are not configured.",
    };
  }

  const body = fs.readFileSync(filePath);
  const objectPath = destinationPath || path.basename(filePath);
  const { error } = await client.storage.from(bucket).upload(objectPath, body, {
    contentType: "image/webp",
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);

  return {
    uploaded: true,
    bucket,
    path: objectPath,
    publicUrl: data.publicUrl,
  };
}

module.exports = {
  uploadGeneratedImage,
};
