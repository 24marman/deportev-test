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

async function ensureBucket(client, bucket, options = {}) {
  const { data: buckets, error: listError } = await client.storage.listBuckets();

  if (listError) {
    throw listError;
  }

  if (buckets.some((item) => item.name === bucket)) {
    return;
  }

  const { error: createError } = await client.storage.createBucket(bucket, {
    public: options.public ?? true,
    fileSizeLimit: options.fileSizeLimit ?? 10485760,
    allowedMimeTypes: options.allowedMimeTypes || ["image/webp"],
  });

  if (createError) {
    throw createError;
  }
}

async function uploadBufferToStorage({
  bucket,
  objectPath,
  buffer,
  contentType = "application/octet-stream",
  publicBucket = true,
  allowedMimeTypes,
}) {
  const client = getSupabaseClient();

  if (!client) {
    return {
      uploaded: false,
      reason: "Supabase variables are not configured.",
    };
  }

  await ensureBucket(client, bucket, {
    public: publicBucket,
    allowedMimeTypes,
  });

  const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
    contentType,
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

async function uploadGeneratedImage(filePath, destinationPath) {
  const client = getSupabaseClient();
  const bucket = process.env.SUPABASE_BUCKET || "generated-images";

  if (!client) {
    return {
      uploaded: false,
      reason: "Supabase variables are not configured.",
    };
  }

  await ensureBucket(client, bucket);

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
  ensureBucket,
  getSupabaseClient,
  uploadBufferToStorage,
  uploadGeneratedImage,
};
