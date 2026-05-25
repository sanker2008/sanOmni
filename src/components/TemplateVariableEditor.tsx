import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, ListPlus } from "lucide-react";

interface Option {
  label: string;
  value: string;
}

interface Variable {
  key: string;
  label: string;
  type: "combobox" | "select" | "input";
  allow_custom?: boolean;
  required?: boolean;
  default?: string;
  options?: Option[];
}

interface TemplateSchema {
  raw_prompt?: string;
  variables?: Variable[];
  [key: string]: any;
}

interface TemplateVariableEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TemplateVariableEditor({ value, onChange }: TemplateVariableEditorProps) {
  const [schema, setSchema] = useState<TemplateSchema | null>(null);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [newOptionValue, setNewOptionValue] = useState("");
  const [addingOptionToKey, setAddingOptionToKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (value.trim()) {
        const parsed = JSON.parse(value);
        if (parsed && Array.isArray(parsed.variables)) {
          setSchema(parsed);
          return;
        }
      }
    } catch (e) {
      // JSON 格式错误时不更新可视编辑器
    }
    setSchema(null);
  }, [value]);

  if (!schema || !schema.variables || schema.variables.length === 0) {
    return null;
  }

  const updateVariableOptions = (varKey: string, newOptions: Option[]) => {
    const updatedVariables = schema.variables!.map((v) => {
      if (v.key === varKey) {
        return { ...v, options: newOptions };
      }
      return v;
    });

    const updatedSchema = { ...schema, variables: updatedVariables };
    onChange(JSON.stringify(updatedSchema, null, 2));
  };

  const handleAddOption = (varKey: string) => {
    if (!newOptionLabel.trim() || !newOptionValue.trim()) return;

    const variable = schema.variables!.find(v => v.key === varKey);
    if (!variable) return;

    const currentOptions = variable.options || [];
    const newOptions = [...currentOptions, { label: newOptionLabel.trim(), value: newOptionValue.trim() }];
    
    updateVariableOptions(varKey, newOptions);
    
    setNewOptionLabel("");
    setNewOptionValue("");
    setAddingOptionToKey(null);
  };

  const handleRemoveOption = (varKey: string, optionIndex: number) => {
    const variable = schema.variables!.find(v => v.key === varKey);
    if (!variable || !variable.options) return;

    const newOptions = [...variable.options];
    newOptions.splice(optionIndex, 1);
    
    updateVariableOptions(varKey, newOptions);
  };

  return (
    <div className="mt-4 space-y-4 rounded-md border p-4 bg-muted/20">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <ListPlus className="w-4 h-4 text-primary" />
        变量选项可视化编辑器
      </h3>
      <p className="text-xs text-muted-foreground">
        系统已成功解析您的 JSON。您可以在下方直接为下拉框类型的变量添加或删除选项，更改会自动同步到 JSON 中。
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {schema.variables.map((v) => {
          if (v.type === "input") return null; // Input types usually don't have preset options to edit

          return (
            <div key={v.key} className="rounded-md border bg-card p-3 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{v.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">({v.key})</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {v.type}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(v.options || []).map((opt, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="text-xs flex items-center gap-1 pl-2 pr-1 py-1 font-normal"
                      title={opt.value}
                    >
                      {opt.label}
                      <button 
                        onClick={() => handleRemoveOption(v.key, idx)}
                        className="rounded-full hover:bg-muted-foreground/20 p-0.5 ml-1 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {(!v.options || v.options.length === 0) && (
                    <span className="text-xs text-muted-foreground">暂无选项</span>
                  )}
                </div>

                {addingOptionToKey === v.key ? (
                  <div className="pt-2 flex flex-col gap-2">
                    <Input 
                      size={1}
                      placeholder="显示名称 (如: 极简黑白)" 
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input 
                      size={1}
                      placeholder="实际 Prompt (如: minimalist monochrome)" 
                      value={newOptionValue}
                      onChange={(e) => setNewOptionValue(e.target.value)}
                      className="h-7 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddOption(v.key);
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleAddOption(v.key)}>
                        确认添加
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddingOptionToKey(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-full mt-2 text-xs text-muted-foreground border border-dashed"
                    onClick={() => {
                      setAddingOptionToKey(v.key);
                      setNewOptionLabel("");
                      setNewOptionValue("");
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    添加选项
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
