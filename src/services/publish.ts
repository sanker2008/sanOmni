import { promptApi, settingsApi } from "./tauri";

const DEFAULT_SANPROMPT_API_URL = "http://localhost:3000/api/sync";

export interface PublishConfig {
  price: number;
  category: string;
  is_published: boolean;
}

async function getPublishTarget() {
  const settings = await settingsApi.getAll();
  const apiUrl = (settings.sanPromptPublishUrl || DEFAULT_SANPROMPT_API_URL).trim();
  let secret = (await settingsApi.getSanPromptPublishSecret()).trim();
  const legacySecret = (settings.sanPromptPublishSecret || "").trim();
  if (!secret && legacySecret) {
    secret = legacySecret;
    settingsApi.setSanPromptPublishSecret(legacySecret).catch((error) => {
      console.error("Failed to migrate sanPrompt publish secret to keyring:", error);
    });
  }

  if (!secret) {
    throw new Error("sanPrompt publish secret is not configured. Set it in sanPrompt settings before publishing.");
  }

  return { apiUrl, secret };
}

function parseJsonArray(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export async function publishPromptToWeb(groupId: string, config: PublishConfig) {
  try {
    const { apiUrl, secret } = await getPublishTarget();
    // 1. 获取本地完整的 Prompt 详情
    const detail = await promptApi.getOne(groupId);
    const { group, images } = detail;

    // 2. 准备 payload
    let template_schema = {};
    if (group.template_schema) {
      try {
        template_schema = JSON.parse(group.template_schema);
      } catch (e) {
        // ignore
      }
    }

    // 假设拿第一张关联图片的 filename 作为封面（实际生产环境需要先上传图床）
    const cover_image_url = images.length > 0 ? `/images/placeholders/${images[0].filename}` : "";

    const name = group.name || "Untitled Template";
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const syncImages = images
      .filter((image) => image.is_sync_enabled !== false && image.role !== "hidden")
      .map((image, index) => {
        let variantJson: unknown;
        if (image.variant_json) {
          try {
            variantJson = JSON.parse(image.variant_json);
          } catch {
            variantJson = image.variant_json;
          }
        }

        return {
          id: image.id,
          filename: image.filename,
          url: image.remote_url || `/images/placeholders/${image.filename}`,
          role: image.role || (image.is_cover ? "cover" : "gallery"),
          is_cover: image.is_cover === true,
          sort_order: image.sort_order ?? index,
          caption: image.caption,
          variant_key: image.variant_key,
          variant_json: variantJson,
          model_name: image.model_name,
          vendor_name: image.vendor_name,
          is_sync_enabled: image.is_sync_enabled !== false,
        };
      });
    const coverImage = syncImages.find((image) => image.is_cover) || syncImages[0];
    const selectedCoverUrl = coverImage?.url || cover_image_url;

    const payload = {
      id: group.id,
      name: name,
      slug: slug,
      description: group.description || "",
      prompt: group.prompt || "",
      negative_prompt: group.negative_prompt || "",
      category: config.category || group.category || "Product & Ecommerce",
      tags: parseJsonArray(group.tags),
      price: config.price ?? group.price ?? 4.99,
      is_published: config.is_published,
      template_schema,
      cover_image_url: selectedCoverUrl,
      images: syncImages,
      tested_models: Array.from(new Set(syncImages.map((image) => image.model_name).filter(Boolean))),
      best_for_models: Array.from(new Set(syncImages.filter((image) => image.is_cover).map((image) => image.model_name).filter(Boolean))),
    };

    // 3. 发送到 Next.js 后端
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`
      },
      body: JSON.stringify({
        action: "publish_template",
        payload
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to publish");
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("Publish error:", error);
    throw error;
  }
}

export async function getPublishStatus(ids: string[]) {
  if (!ids || ids.length === 0) return [];

  let target: { apiUrl: string; secret: string };
  try {
    target = await getPublishTarget();
  } catch (error) {
    console.error("Get status skipped:", error);
    return [];
  }

  const CHUNK_SIZE = 20;
  const allResults: { id: string; price: number; category: string; is_published: boolean }[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      const response = await fetch(target.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${target.secret}`
        },
        body: JSON.stringify({
          action: "get_status",
          payload: { ids: chunk }
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          allResults.push(...result.data);
        }
      } else {
        console.error(`Get status chunk error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error("Get status chunk error:", error);
    }
  }

  return allResults;
}
