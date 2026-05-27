import { useState } from "react";
import { useVendorStore } from "@/stores";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Save, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConfirmDialog from "./ConfirmDialog";

export default function VendorsView() {
  const { vendors, setVendors } = useVendorStore();
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [editingVendor, setEditingVendor] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: "", path: "" });
  const [modelForm, setModelForm] = useState({ name: "", path: "", description: "" });
  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);
  const [modelToDelete, setModelToDelete] = useState<{id: string, name: string} | null>(null);
  const [modelUsageCount, setModelUsageCount] = useState<number>(0);
  const [vendorToDelete, setVendorToDelete] = useState<{id: string, name: string} | null>(null);
  const [vendorUsageCount, setVendorUsageCount] = useState<number>(0);
  const [deleteVendorStep, setDeleteVendorStep] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <Card>
                <CardHeader>
                  <CardTitle className="text-base">厂商和模型管理</CardTitle>
                  <CardDescription>
                    管理所有 AI 图片生成厂商和对应的模型
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {vendors.map((vendor) => {
                      const isExpanded = expandedVendors.has(vendor.id);
                      const isEditing = editingVendor === vendor.id;

                      return (
                        <div key={vendor.id} className="border rounded-lg p-3">
                          {/* Vendor Header */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const next = new Set(expandedVendors);
                                if (next.has(vendor.id)) {
                                  next.delete(vendor.id);
                                } else {
                                  next.add(vendor.id);
                                }
                                setExpandedVendors(next);
                              }}
                              className="p-1 hover:bg-muted rounded"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>

                            {isEditing ? (
                              <div className="flex-1 flex items-center gap-2">
                                <Input
                                  value={vendorForm.name}
                                  onChange={(e) =>
                                    setVendorForm({ ...vendorForm, name: e.target.value })
                                  }
                                  placeholder="厂商名称"
                                  className="flex-1"
                                />
                                <Input
                                  value={vendorForm.path}
                                  onChange={(e) =>
                                    setVendorForm({ ...vendorForm, path: e.target.value })
                                  }
                                  placeholder="路径标识"
                                  className="flex-1"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      const { vendorApi } = await import("@/services/tauri");
                                      await vendorApi.update(vendor.id, vendorForm.name, vendorForm.path);
                                      // Reload vendors
                                      const updatedVendors = await vendorApi.getAll();
                                      setVendors(updatedVendors);
                                      setEditingVendor(null);
                                    } catch (error) {
                                      toast({
                                        title: "✗ 更新失败",
                                        description: String(error),
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingVendor(null)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium flex-1">{vendor.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {vendor.models.length} 个模型
                                </Badge>
                                {vendor.id !== "unknown" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingVendor(vendor.id);
                                        setVendorForm({ name: vendor.name, path: vendor.path });
                                      }}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={async () => {
                                        try {
                                          const { vendorApi } = await import("@/services/tauri");
                                          const count = await vendorApi.checkVendorUsage(vendor.id);
                                          setVendorToDelete({ id: vendor.id, name: vendor.name });
                                          setVendorUsageCount(count);
                                          if (count > 0) {
                                            setDeleteVendorStep(-1);
                                          } else {
                                            setDeleteVendorStep(1);
                                          }
                                        } catch (error) {
                                          toast({
                                            title: "✗ 检查失败",
                                            description: String(error),
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>

                          {/* Models List */}
                          {isExpanded && (
                            <div className="ml-8 mt-3 space-y-2">
                              {vendor.models.map((model) => {
                                const isEditingModel = editingModel === model.id;

                                return (
                                  <div
                                    key={model.id}
                                    className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                                  >
                                    {isEditingModel ? (
                                      <>
                                        <Input
                                          value={modelForm.name}
                                          onChange={(e) =>
                                            setModelForm({ ...modelForm, name: e.target.value })
                                          }
                                          placeholder="模型名称"
                                          className="flex-1"
                                        />
                                        <Input
                                          value={modelForm.path}
                                          onChange={(e) =>
                                            setModelForm({ ...modelForm, path: e.target.value })
                                          }
                                          placeholder="路径标识"
                                          className="flex-1"
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={async () => {
                                            try {
                                              const { vendorApi } = await import("@/services/tauri");
                                              await vendorApi.updateModel(
                                                model.id,
                                                modelForm.name,
                                                modelForm.path,
                                                modelForm.description
                                              );
                                              const updatedVendors = await vendorApi.getAll();
                                              setVendors(updatedVendors);
                                              setEditingModel(null);
                                            } catch (error) {
                                              toast({
                                                title: "✗ 更新失败",
                                                description: String(error),
                                                variant: "destructive",
                                              });
                                            }
                                          }}
                                        >
                                          <Save className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setEditingModel(null)}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm flex-1">{model.name}</span>
                                        {model.id !== "unknown" && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                setEditingModel(model.id);
                                                setModelForm({
                                                  name: model.name,
                                                  path: model.path,
                                                  description: model.description || "",
                                                });
                                              }}
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={async () => {
                                                try {
                                                  const { vendorApi } = await import("@/services/tauri");
                                                  const count = await vendorApi.checkModelUsage(model.id);
                                                  if (count === 0) {
                                                    if (confirm(`确定要删除模型 "${model.name}" 吗？`)) {
                                                      await vendorApi.deleteModelCascade(model.id, "none");
                                                      const updatedVendors = await vendorApi.getAll();
                                                      setVendors(updatedVendors);
                                                    }
                                                  } else {
                                                    setModelToDelete({ id: model.id, name: model.name });
                                                    setModelUsageCount(count);
                                                  }
                                                } catch (error) {
                                                  toast({
                                                    title: "✗ 检查失败",
                                                    description: String(error),
                                                    variant: "destructive",
                                                  });
                                                }
                                              }}
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Add Model Form */}
                              {addingModelForVendor === vendor.id ? (
                                <div className="flex items-center gap-2 p-2 rounded-md border bg-blue-50 dark:bg-blue-950">
                                  <Input
                                    value={modelForm.name}
                                    onChange={(e) =>
                                      setModelForm({ ...modelForm, name: e.target.value })
                                    }
                                    placeholder="模型名称"
                                    className="flex-1"
                                  />
                                  <Input
                                    value={modelForm.path}
                                    onChange={(e) =>
                                      setModelForm({ ...modelForm, path: e.target.value })
                                    }
                                    placeholder="路径标识"
                                    className="flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      try {
                                        const { vendorApi } = await import("@/services/tauri");
                                        await vendorApi.addModel(
                                          vendor.id,
                                          modelForm.name,
                                          modelForm.path,
                                          modelForm.description
                                        );
                                        const updatedVendors = await vendorApi.getAll();
                                        setVendors(updatedVendors);
                                        setAddingModelForVendor(null);
                                        setModelForm({ name: "", path: "", description: "" });
                                      } catch (error) {
                                        toast({
                                          title: "✗ 添加失败",
                                          description: String(error),
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    <Save className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setAddingModelForVendor(null);
                                      setModelForm({ name: "", path: "", description: "" });
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => {
                                    setAddingModelForVendor(vendor.id);
                                    setModelForm({ name: "", path: "", description: "" });
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  添加模型
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Vendor Button */}
                    <Separator />
                    {editingVendor === "new" ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950">
                        <Input
                          value={vendorForm.name}
                          onChange={(e) =>
                            setVendorForm({ ...vendorForm, name: e.target.value })
                          }
                          placeholder="厂商名称（如：OpenAI）"
                          className="flex-1"
                        />
                        <Input
                          value={vendorForm.path}
                          onChange={(e) =>
                            setVendorForm({ ...vendorForm, path: e.target.value })
                          }
                          placeholder="路径标识（如：openai）"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const { vendorApi } = await import("@/services/tauri");
                              await vendorApi.add(vendorForm.name, vendorForm.path);
                              const updatedVendors = await vendorApi.getAll();
                              setVendors(updatedVendors);
                              setEditingVendor(null);
                              setVendorForm({ name: "", path: "" });
                            } catch (error) {
                              toast({
                                title: "✗ 添加失败",
                                description: String(error),
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingVendor(null);
                            setVendorForm({ name: "", path: "" });
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setEditingVendor("new");
                          setVendorForm({ name: "", path: "" });
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        添加新厂商
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

      <Dialog open={!!modelToDelete} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除模型确认</DialogTitle>
            <DialogDescription className="space-y-2 pt-4 text-base">
              模型 <span className="font-semibold text-foreground">{modelToDelete?.name}</span> 目前被 <span className="font-semibold text-destructive">{modelUsageCount}</span> 张图片关联。
              <br/><br/>
              为了保证数据一致性，请选择对这些关联图片的处理方式：
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2 mt-4">
            <Button
              variant="destructive"
              className="w-full sm:w-full"
              disabled={isDeleting}
              onClick={async () => {
                if (!modelToDelete) return;
                setIsDeleting(true);
                try {
                  const { vendorApi } = await import("@/services/tauri");
                  await vendorApi.deleteModelCascade(modelToDelete.id, "delete_images");
                  const updatedVendors = await vendorApi.getAll();
                  setVendors(updatedVendors);
                  setModelToDelete(null);
                  toast({ title: "✓ 删除成功", description: "已删除模型及所有关联图片" });
                } catch (error) {
                  toast({ title: "✗ 删除失败", description: String(error), variant: "destructive" });
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              删除模型及关联图片（高危操作：会彻底删除图片文件）
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-full"
              disabled={isDeleting}
              onClick={async () => {
                if (!modelToDelete) return;
                setIsDeleting(true);
                try {
                  const { vendorApi } = await import("@/services/tauri");
                  await vendorApi.deleteModelCascade(modelToDelete.id, "move_to_unknown");
                  const updatedVendors = await vendorApi.getAll();
                  setVendors(updatedVendors);
                  setModelToDelete(null);
                  toast({ title: "✓ 删除成功", description: "图片已迁移至其他模型或 Unknown" });
                } catch (error) {
                  toast({ title: "✗ 删除失败", description: String(error), variant: "destructive" });
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              仅删除模型，图片移至其他模型/Unknown（推荐）
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-full mt-2"
              disabled={isDeleting}
              onClick={() => setModelToDelete(null)}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 无法删除厂商提示 */}
      <Dialog open={deleteVendorStep === -1} onOpenChange={(open) => !open && setDeleteVendorStep(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              无法删除厂商
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-4 text-base">
              厂商 <span className="font-semibold text-foreground">{vendorToDelete?.name}</span> 目前有 <span className="font-semibold text-destructive">{vendorUsageCount}</span> 张图片关联。
              <br/><br/>
              为了保障数据完整性，<span className="font-semibold text-foreground text-destructive">不可以删除</span>有关联图片的厂商！请先将这些图片的生成模型归档、删除或重新分类，然后再试。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              className="w-full"
              onClick={() => {
                setDeleteVendorStep(0);
                setVendorToDelete(null);
              }}
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除厂商确认 - 步骤 1 */}
      <ConfirmDialog
        open={deleteVendorStep === 1}
        title="确认删除厂商"
        description={`确定要删除厂商 "${vendorToDelete?.name}" 吗？注意：这不会物理删除磁盘上的文件，但在数据库中此厂商的记录将被移除！`}
        confirmText="继续"
        cancelText="取消"
        variant="destructive"
        onConfirm={() => setDeleteVendorStep(2)}
        onCancel={() => {
          setDeleteVendorStep(0);
          setVendorToDelete(null);
        }}
      />

      {/* 删除厂商确认 - 步骤 2 */}
      <ConfirmDialog
        open={deleteVendorStep === 2}
        title="⚠️ 最终删除确认"
        description={`【严重警告】您真的非常确定要彻底删除厂商 "${vendorToDelete?.name}" 吗？此操作不可逆！`}
        confirmText="确认彻底删除"
        cancelText="取消"
        variant="destructive"
        onConfirm={async () => {
          if (!vendorToDelete) return;
          setDeleteVendorStep(0);
          try {
            const { vendorApi } = await import("@/services/tauri");
            await vendorApi.delete(vendorToDelete.id);
            const updatedVendors = await vendorApi.getAll();
            setVendors(updatedVendors);
            toast({
              title: "✓ 删除成功",
              description: `厂商 "${vendorToDelete.name}" 已成功删除`,
            });
          } catch (error) {
            toast({
              title: "✗ 删除失败",
              description: String(error),
              variant: "destructive",
            });
          } finally {
            setVendorToDelete(null);
          }
        }}
        onCancel={() => {
          setDeleteVendorStep(0);
          setVendorToDelete(null);
        }}
      />
    </div>
  );
}
