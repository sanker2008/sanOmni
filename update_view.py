import sys
import re

file_path = 'src/components/IpArchivedView.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
imports = '''import { useEffect, useState, useMemo, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';'''
content = content.replace('import { useEffect, useState, useMemo, useRef } from "react";', imports)

# 2. Add SortableEmojiCard before export default function IpArchivedView
sortable_component = '''function SortableEmojiCard({ id, children }: { id: string, children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function IpArchivedView() {'''
content = content.replace('export default function IpArchivedView() {', sortable_component)

# 3. Add handleDragEnd and displayEmojis state
state_logic = '''  const currentEmojis = useMemo(() => {
    if (!ipDetail) return [];
    if (selectedPackId === "__ALL__") return ipDetail.emojis;
    if (selectedPackId === "__UNGROUPED__") return ipDetail.emojis.filter((e) => !e.pack_id);
    return ipDetail.emojis.filter((e) => e.pack_id === selectedPackId);
  }, [ipDetail, selectedPackId]);

  const [displayEmojis, setDisplayEmojis] = useState(currentEmojis);

  useEffect(() => {
    setDisplayEmojis(currentEmojis);
  }, [currentEmojis]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDisplayEmojis((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        const newIds = newItems.map(item => item.id);
        ipApi.updateEmojisSort(newIds).then(() => {
            fetchIpAssetDetail(selectedIpId!); 
        }).catch(err => {
            console.error("更新排序失败", err);
            toast({
                title: "失败",
                description: "更新排序失败：" + err.message,
                variant: "destructive",
            });
        });
        
        return newItems;
      });
    }
  };'''

old_state_logic = '''  const currentEmojis = useMemo(() => {
    if (!ipDetail) return [];
    if (selectedPackId === "__ALL__") return ipDetail.emojis;
    if (selectedPackId === "__UNGROUPED__") return ipDetail.emojis.filter((e) => !e.pack_id);
    return ipDetail.emojis.filter((e) => e.pack_id === selectedPackId);
  }, [ipDetail, selectedPackId]);'''

content = content.replace(old_state_logic, state_logic)

# 4. Wrap grid with DndContext
old_grid = '''<div className="p-4 pb-28 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {currentEmojis.map((emoji, index) => {
                          return (
                            <div
                              key={emoji.id}
                              className="group relative rounded-md border bg-card p-1 flex flex-col gap-1.5 hover:shadow-md transition-all duration-300"
                            >'''

new_grid = '''<DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext 
                          items={displayEmojis.map(e => e.id)}
                          strategy={rectSortingStrategy}
                        >
                          <div className="p-4 pb-28 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            {displayEmojis.map((emoji, index) => {
                              return (
                                <SortableEmojiCard key={emoji.id} id={emoji.id}>
                                  <div
                                    className="group relative rounded-md border bg-card p-1 flex flex-col gap-1.5 hover:shadow-md transition-all duration-300"
                                  >'''

content = content.replace(old_grid, new_grid)

# 5. Fix references inside the loop
old_loop_end = '''                            </div>
                          );
                        })}
                      </div>'''

new_loop_end = '''                                  </div>
                                </SortableEmojiCard>
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>'''

content = content.replace(old_loop_end, new_loop_end)

preview_code_old = '''const paths = currentEmojis.map(e => e.image_path);'''
preview_code_new = '''const paths = displayEmojis.map(e => e.image_path);'''
content = content.replace(preview_code_old, preview_code_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
