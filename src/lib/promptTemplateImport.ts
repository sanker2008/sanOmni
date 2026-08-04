import { PROMPT_TEMPLATE_CATEGORIES } from "@/lib/promptTaxonomy";

/**
 * 可移植 Prompt 模板文件格式。
 *
 * 这个格式刻意保留了数据库中独立存储的基础字段和 Template JSON：导入时会
 * 校验两处内容完全一致，防止 Agent 只生成了其中一半数据而造成显示与实际
 * 渲染结果不一致。
 */
export const PROMPT_TEMPLATE_IMPORT_FORMAT = "sanOmni.prompt-template";
export const PROMPT_TEMPLATE_IMPORT_VERSION = 1;

export type PromptTemplateVariableType = "combobox" | "select" | "input";

export interface PromptTemplateVariableOption {
  label: string;
  value: string;
}

export interface PromptTemplateVariable {
  key: string;
  label: string;
  type: PromptTemplateVariableType;
  allow_custom: boolean;
  required: boolean;
  default: string;
  options: PromptTemplateVariableOption[];
}

export interface PromptTemplateSchema {
  name: string;
  description: string;
  raw_prompt: string;
  negative_prompt: string;
  variables: PromptTemplateVariable[];
}

export interface PromptTemplateImportTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  prompt: string;
  negative_prompt: string;
  template_schema: PromptTemplateSchema;
}

/** 一个 JSON 文件可包含多个模板。 */
export interface PromptTemplateImport {
  format: typeof PROMPT_TEMPLATE_IMPORT_FORMAT;
  version: typeof PROMPT_TEMPLATE_IMPORT_VERSION;
  templates: PromptTemplateImportTemplate[];
}

export interface PromptTemplateImportItemValidation {
  /** 文件内 templates 数组的从零开始下标；旧格式固定为 0。 */
  index: number;
  template?: PromptTemplateImportTemplate;
  issues: string[];
}

export interface ParsedPromptTemplateImport {
  format: typeof PROMPT_TEMPLATE_IMPORT_FORMAT;
  version: typeof PROMPT_TEMPLATE_IMPORT_VERSION;
  /** 兼容此前下载的单模板示例；新生成的文件应始终使用 templates。 */
  sourceFormat: "templates" | "legacy-template";
  items: PromptTemplateImportItemValidation[];
}

export interface ImportedPromptTemplateFormData {
  prompt: string;
  negative_prompt: string;
  name: string;
  description: string;
  template_schema: string;
  category: string;
  tags: string;
  price: string;
}

export class PromptTemplateImportError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("；"));
    this.name = "PromptTemplateImportError";
  }
}

const ALLOWED_CATEGORIES = new Set(PROMPT_TEMPLATE_CATEGORIES.map((category) => category.value));
const VARIABLE_TYPES = new Set<PromptTemplateVariableType>(["combobox", "select", "input"]);
const VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CHINESE_CHARACTER_PATTERN = /[\u3400-\u9fff]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, issues: string[], path: string): string {
  const value = record[key];
  const fieldPath = `${path}.${key}`;
  if (typeof value !== "string") {
    issues.push(`缺少字符串字段 ${fieldPath}`);
    return "";
  }
  if (!value.trim()) {
    issues.push(`${fieldPath} 不能为空`);
  }
  const normalizedValue = value.trim();
  if (CHINESE_CHARACTER_PATTERN.test(normalizedValue)) {
    issues.push(`${fieldPath} 必须使用英文，不能包含中文字符`);
  }
  return normalizedValue;
}

function requiredStringAllowEmpty(record: Record<string, unknown>, key: string, issues: string[], path: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    issues.push(`缺少字符串字段 ${path}.${key}`);
    return "";
  }
  const normalizedValue = value.trim();
  if (CHINESE_CHARACTER_PATTERN.test(normalizedValue)) {
    issues.push(`${path}.${key} 必须使用英文，不能包含中文字符`);
  }
  return normalizedValue;
}

function validateVariables(value: unknown, issues: string[], path: string): PromptTemplateVariable[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}.variables 必须是数组（静态模板请传 []）`);
    return [];
  }

  const keys = new Set<string>();
  return value.flatMap((entry, index) => {
    const variablePath = `${path}.variables[${index}]`;
    if (!isRecord(entry)) {
      issues.push(`${variablePath} 必须是对象`);
      return [];
    }

    const key = requiredStringAllowEmpty(entry, "key", issues, variablePath);
    const label = requiredStringAllowEmpty(entry, "label", issues, variablePath);
    const type = entry.type;
    const allowCustom = entry.allow_custom;
    const required = entry.required;
    const defaultValue = requiredStringAllowEmpty(entry, "default", issues, variablePath);
    const optionsValue = entry.options;

    if (!VARIABLE_KEY_PATTERN.test(key)) {
      issues.push(`${variablePath}.key 只能使用字母、数字和下划线，且不能以数字开头`);
    } else if (keys.has(key)) {
      issues.push(`${variablePath}.key 与前面的变量重复：${key}`);
    } else {
      keys.add(key);
    }
    if (!label) issues.push(`${variablePath}.label 不能为空`);
    if (typeof type !== "string" || !VARIABLE_TYPES.has(type as PromptTemplateVariableType)) {
      issues.push(`${variablePath}.type 必须是 combobox、select 或 input`);
    }
    if (typeof allowCustom !== "boolean") issues.push(`${variablePath}.allow_custom 必须是布尔值`);
    if (typeof required !== "boolean") issues.push(`${variablePath}.required 必须是布尔值`);
    if (!Array.isArray(optionsValue)) {
      issues.push(`${variablePath}.options 必须是数组`);
    }

    const options = Array.isArray(optionsValue)
      ? optionsValue.flatMap((option, optionIndex) => {
          const optionPath = `${variablePath}.options[${optionIndex}]`;
          if (!isRecord(option)) {
            issues.push(`${optionPath} 必须是对象`);
            return [];
          }
          const optionLabel = requiredStringAllowEmpty(option, "label", issues, optionPath);
          const optionValue = requiredStringAllowEmpty(option, "value", issues, optionPath);
          if (!optionLabel) issues.push(`${optionPath}.label 不能为空`);
          if (!optionValue) issues.push(`${optionPath}.value 不能为空`);
          return [{ label: optionLabel, value: optionValue }];
        })
      : [];

    return [{
      key,
      label,
      type: VARIABLE_TYPES.has(type as PromptTemplateVariableType) ? type as PromptTemplateVariableType : "input",
      allow_custom: Boolean(allowCustom),
      required: Boolean(required),
      default: defaultValue,
      options,
    }];
  });
}

function validateTemplate(value: unknown, index: number): PromptTemplateImportItemValidation {
  const path = `templates[${index}]`;
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { index, issues: [`${path} 必须是对象`] };
  }

  const name = requiredString(value, "name", issues, path);
  const description = requiredString(value, "description", issues, path);
  const category = requiredString(value, "category", issues, path);
  const prompt = requiredString(value, "prompt", issues, path);
  const negativePrompt = requiredStringAllowEmpty(value, "negative_prompt", issues, path);
  const price = value.price;
  const tags = value.tags;

  if (!ALLOWED_CATEGORIES.has(category as typeof PROMPT_TEMPLATE_CATEGORIES[number]["value"])) {
    issues.push(`${path}.category 不是 sanOmni 支持的分类`);
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    issues.push(`${path}.price 必须是大于等于 0 的数字`);
  }
  if (!Array.isArray(tags)) {
    issues.push(`${path}.tags 必须是字符串数组`);
  } else {
    const seenTags = new Set<string>();
    tags.forEach((tag, tagIndex) => {
      if (typeof tag !== "string" || !tag.trim()) {
        issues.push(`${path}.tags[${tagIndex}] 必须是非空字符串`);
      } else if (CHINESE_CHARACTER_PATTERN.test(tag.trim())) {
        issues.push(`${path}.tags[${tagIndex}] 必须使用英文，不能包含中文字符`);
      } else if (seenTags.has(tag.trim())) {
        issues.push(`${path}.tags 中存在重复标签：${tag.trim()}`);
      } else {
        seenTags.add(tag.trim());
      }
    });
  }

  if (!isRecord(value.template_schema)) {
    issues.push(`${path}.template_schema 必须是对象`);
    return { index, issues };
  }

  const schemaValue = value.template_schema;
  const schemaPath = `${path}.template_schema`;
  const schemaName = requiredString(schemaValue, "name", issues, schemaPath);
  const schemaDescription = requiredString(schemaValue, "description", issues, schemaPath);
  const schemaPrompt = requiredString(schemaValue, "raw_prompt", issues, schemaPath);
  const schemaNegativePrompt = requiredStringAllowEmpty(schemaValue, "negative_prompt", issues, schemaPath);
  const variables = validateVariables(schemaValue.variables, issues, schemaPath);

  if (schemaName !== name) issues.push(`${schemaPath}.name 必须与 ${path}.name 完全一致`);
  if (schemaDescription !== description) issues.push(`${schemaPath}.description 必须与 ${path}.description 完全一致`);
  if (schemaPrompt !== prompt) issues.push(`${schemaPath}.raw_prompt 必须与 ${path}.prompt 完全一致`);
  if (schemaNegativePrompt !== negativePrompt) issues.push(`${schemaPath}.negative_prompt 必须与 ${path}.negative_prompt 完全一致`);

  const placeholders = new Set(
    Array.from(prompt.matchAll(/\{\{([^{}]+)\}\}/g), (match) => match[1]),
  );
  const variableKeys = new Set(variables.map((variable) => variable.key));
  variableKeys.forEach((key) => {
    if (!placeholders.has(key)) issues.push(`${path}.variables 中的 ${key} 没有在 prompt 中使用 {{${key}}}`);
  });
  placeholders.forEach((key) => {
    if (!variableKeys.has(key)) issues.push(`${path}.prompt 使用了未定义的变量 {{${key}}}`);
  });

  if (issues.length > 0) return { index, issues };

  return {
    index,
    issues: [],
    template: {
      name,
      description,
      category,
      tags: (tags as string[]).map((tag) => tag.trim()),
      price: price as number,
      prompt,
      negative_prompt: negativePrompt,
      template_schema: {
        name: schemaName,
        description: schemaDescription,
        raw_prompt: schemaPrompt,
        negative_prompt: schemaNegativePrompt,
        variables,
      },
    },
  };
}

/**
 * 解析并严格校验 Agent 生成的模板文件，不会静默补默认值。
 *
 * 顶层格式错误会直接抛出；每个模板的字段错误会逐项返回，以便批量文件中
 * 已通过的模板仍能被清晰展示和导入。
 */
export function parsePromptTemplateImport(source: string): ParsedPromptTemplateImport {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new PromptTemplateImportError(["文件不是有效的 JSON"]);
  }

  if (!isRecord(value)) {
    throw new PromptTemplateImportError(["导入文件最外层必须是 JSON 对象"]);
  }

  const issues: string[] = [];
  if (value.format !== PROMPT_TEMPLATE_IMPORT_FORMAT) {
    issues.push(`format 必须为 ${PROMPT_TEMPLATE_IMPORT_FORMAT}`);
  }
  if (value.version !== PROMPT_TEMPLATE_IMPORT_VERSION) {
    issues.push(`version 必须为 ${PROMPT_TEMPLATE_IMPORT_VERSION}`);
  }

  const hasTemplates = Object.prototype.hasOwnProperty.call(value, "templates");
  const hasLegacyTemplate = Object.prototype.hasOwnProperty.call(value, "template");
  if (hasTemplates && hasLegacyTemplate) {
    issues.push("导入文件只能使用 templates，不能同时包含旧字段 template");
  }

  let templates: unknown[] = [];
  let sourceFormat: ParsedPromptTemplateImport["sourceFormat"] = "templates";
  if (hasTemplates) {
    if (!Array.isArray(value.templates) || value.templates.length === 0) {
      issues.push("templates 必须是至少包含一个模板的数组");
    } else {
      templates = value.templates;
    }
  } else if (hasLegacyTemplate) {
    if (!isRecord(value.template)) {
      issues.push("旧字段 template 必须是对象");
    } else {
      templates = [value.template];
      sourceFormat = "legacy-template";
    }
  } else {
    issues.push("缺少 templates 数组");
  }

  if (issues.length > 0) throw new PromptTemplateImportError(issues);

  return {
    format: PROMPT_TEMPLATE_IMPORT_FORMAT,
    version: PROMPT_TEMPLATE_IMPORT_VERSION,
    sourceFormat,
    items: templates.map((template, index) => validateTemplate(template, index)),
  };
}

export function promptTemplateImportToFormData(value: PromptTemplateImportTemplate): ImportedPromptTemplateFormData {
  return {
    prompt: value.prompt,
    negative_prompt: value.negative_prompt,
    name: value.name,
    description: value.description,
    template_schema: JSON.stringify(value.template_schema, null, 2),
    category: value.category,
    tags: value.tags.join(", "),
    price: value.price.toString(),
  };
}

export function getPromptTemplateImportExample(): PromptTemplateImport {
  const prompt = "Create a premium ecommerce hero image for {{product_name}} on a {{background_color}} background, with soft studio lighting, clean composition, and polished commercial product photography.";
  const negativePrompt = "low resolution, watermark, incorrect text, deformed objects, cluttered background";
  const name = "Glassware Ecommerce Hero Image";
  const description = "Creates a clean, premium product hero image for glassware ecommerce listings with configurable product name and background color.";

  return {
    format: PROMPT_TEMPLATE_IMPORT_FORMAT,
    version: PROMPT_TEMPLATE_IMPORT_VERSION,
    templates: [
      {
        name,
        description,
        category: "Product & Ecommerce",
        tags: ["ecommerce", "product photography", "glassware"],
        price: 4.99,
        prompt,
        negative_prompt: negativePrompt,
        template_schema: {
          name,
          description,
          raw_prompt: prompt,
          negative_prompt: negativePrompt,
          variables: [
            {
              key: "product_name",
              label: "Product Name",
              type: "input",
              allow_custom: true,
              required: true,
              default: "Perfume Bottle",
              options: [],
            },
            {
              key: "background_color",
              label: "Background Color",
              type: "select",
              allow_custom: false,
              required: true,
              default: "Cream White",
              options: [
                { label: "Cream White", value: "Cream White" },
                { label: "Muted Blue", value: "Muted Blue" },
                { label: "Warm Gray", value: "Warm Gray" },
              ],
            },
          ],
        },
      },
    ],
  };
}
