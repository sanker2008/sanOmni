# Implementation Plan: IP 作品集功能

## Overview

本实现计划将 IP 作品集功能集成到现有的 sanOmni 应用中。该功能采用低耦合设计，支持管理作品（电视剧、电影、小说等）及其角色信息，并可将 IP 资产关联到作品角色。

技术栈：
- 后端：Rust + Tauri 2.0 + SQLite (rusqlite)
- 前端：React 18 + TypeScript + Zustand + shadcn/ui
- 数据库：3 个新表（works, characters, work_tags）

实现顺序遵循依赖关系：数据库层 → 后端模型 → 后端命令 → 前端类型 → 前端 Store → UI 组件

## Tasks

- [ ] 1. 创建数据库表结构和迁移逻辑
  - 在 `src-tauri/src/database/mod.rs` 的 `init_database` 函数中添加 works、characters、work_tags 三个表的创建语句
  - 添加所有必要的索引（work_type, status, work_id, ip_id, display_order, deleted_at, tag_id）
  - 配置外键约束（characters.work_id ON DELETE CASCADE, characters.ip_id ON DELETE SET NULL, work_tags 的级联删除）
  - 测试数据库初始化逻辑
  - _Requirements: R1.1, R3.1, R10.2, R10.3_

- [ ] 2. 实现后端数据模型
  - [ ] 2.1 在 `src-tauri/src/models/mod.rs` 中定义作品和角色相关的数据结构
    - 定义枚举类型：WorkType, WorkStatus, CharacterType（使用 serde rename_all = "snake_case"）
    - 定义基础结构体：Work, Character
    - 定义关联结构体：WorkWithRelations, CharacterWithRelations
    - 定义筛选参数：WorkFilters
    - 为所有结构体实现 Serialize 和 Deserialize trait
    - _Requirements: R1.1, R2.1, R2.2, R3.1, R4.1_

- [ ] 3. 实现作品管理命令
  - [ ] 3.1 创建 `src-tauri/src/commands/works.rs` 并实现基础 CRUD 命令
    - 实现 create_work 命令（生成 UUID，设置时间戳）
    - 实现 get_works 命令（支持 WorkFilters 筛选，构建动态 SQL 查询）
    - 实现 get_work_by_id 命令（关联查询 tags 和 characters）
    - 实现 update_work 命令（更新 updated_at 时间戳）
    - 实现 delete_work 命令（软删除，设置 deleted_at）
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R6.1, R6.2, R6.3, R6.4, R6.5, R6.6_

  - [ ] 3.2 实现作品文件管理命令
    - 实现 upload_work_cover 命令（保存到 works/{work_id}/cover.{ext}，更新数据库）
    - 实现 cleanup_work_files 辅助函数（删除作品时清理文件）
    - 支持常见图片格式（jpg, png, gif, webp）
    - _Requirements: R1.6, R9.1, R9.3, R9.4_

  - [ ] 3.3 实现作品标签管理命令
    - 实现 add_work_tag 命令（INSERT OR IGNORE）
    - 实现 remove_work_tag 命令（DELETE）
    - _Requirements: R1.7_

- [ ] 4. 实现角色管理命令
  - [ ] 4.1 创建 `src-tauri/src/commands/characters.rs` 并实现基础 CRUD 命令
    - 实现 create_character 命令（生成 UUID，自动计算 display_order）
    - 实现 get_characters 命令（按 work_id 查询，关联 IP 信息）
    - 实现 get_character_by_id 命令（关联查询 work 和 IP 信息）
    - 实现 update_character 命令（更新 updated_at 时间戳）
    - 实现 delete_character 命令（软删除，设置 deleted_at）
    - 实现 update_character_order 命令（批量更新 display_order）
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.6_

  - [ ] 4.2 实现角色文件管理命令
    - 实现 upload_character_images 命令（保存到 works/{work_id}/characters/{character_id}_{index}.{ext}）
    - 将图片路径数组序列化为 JSON 存储到 image_paths 字段
    - 实现 cleanup_character_files 辅助函数（删除角色时清理文件）
    - _Requirements: R3.5, R9.2, R9.3, R9.5_

  - [ ] 4.3 实现 IP 关联查询命令
    - 实现 get_ip_characters 命令（查询某个 IP 关联的所有角色，跨作品）
    - _Requirements: R5.4, R8.2_

- [ ] 5. 注册后端命令到 Tauri
  - 在 `src-tauri/src/commands/mod.rs` 中导出 works 和 characters 模块
  - 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册所有新命令（create_work, get_works, get_work_by_id, update_work, delete_work, upload_work_cover, add_work_tag, remove_work_tag, create_character, get_characters, get_character_by_id, update_character, delete_character, update_character_order, upload_character_images, get_ip_characters）
  - _Requirements: R1, R3, R5_

- [ ] 6. Checkpoint - 验证后端实现
  - 使用 `npm run tauri:dev` 启动应用，确保编译无错误
  - 在浏览器控制台测试 Tauri 命令调用（使用 `invoke` 函数）
  - 验证数据库表创建成功
  - 如有问题，询问用户

- [ ] 7. 定义前端类型
  - [ ] 7.1 在 `src/stores/index.ts` 中添加作品和角色相关的 TypeScript 类型
    - 定义类型别名：WorkType, WorkStatus, CharacterType（与后端枚举对应）
    - 定义接口：Work, WorkWithRelations, Character, CharacterWithRelations
    - 定义筛选接口：WorkFilters
    - 确保字段名与后端 Rust 结构体一致（snake_case）
    - _Requirements: R1.1, R2.1, R2.2, R3.1, R4.1, R6.1_

- [ ] 8. 实现前端服务层
  - [ ] 8.1 在 `src/services/tauri.ts` 中添加作品管理 API 包装函数
    - 实现 createWork, getWorks, getWorkById, updateWork, deleteWork
    - 实现 uploadWorkCover, addWorkTag, removeWorkTag
    - 使用 `invoke` 函数调用后端命令，添加类型注解
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7_

  - [ ] 8.2 在 `src/services/tauri.ts` 中添加角色管理 API 包装函数
    - 实现 createCharacter, getCharacters, getCharacterById, updateCharacter, deleteCharacter
    - 实现 updateCharacterOrder, uploadCharacterImages, getIpCharacters
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R5.4, R8.2_

- [ ] 9. 实现 Zustand Store
  - [ ] 9.1 创建 useWorksStore
    - 定义状态：works, selectedWork, filters, loading
    - 实现 actions：fetchWorks, createWork, updateWork, deleteWork, selectWork, setFilters
    - 实现文件上传 action：uploadCover（处理 File 对象转换为字节数组）
    - 实现标签管理 actions：addTag, removeTag
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R6.5_

  - [ ] 9.2 创建 useCharactersStore
    - 定义状态：characters, loading
    - 实现 actions：fetchCharacters, createCharacter, updateCharacter, deleteCharacter
    - 实现 updateOrder action（拖拽排序支持）
    - 实现 uploadImages action（处理多个 File 对象）
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6_

- [ ] 10. 实现作品列表视图
  - [ ] 10.1 创建 `src/components/WorksView.tsx` 主视图组件
    - 实现顶部工具栏（搜索框、类型筛选、状态筛选、排序选项、新建按钮）
    - 实现作品网格布局（使用 ScrollArea 和 grid 布局）
    - 实现加载状态（Skeleton 组件）和空状态提示
    - 集成 WorkEditModal 对话框
    - 使用 useWorksStore 管理状态
    - _Requirements: R1.2, R6.1, R6.2, R6.3, R6.6, R11.2, R11.6_

  - [ ] 10.2 在 `src/App.tsx` 中添加作品集路由
    - 添加 `/works` 路由指向 WorksView
    - 添加 `/works/:id` 路由指向 WorkDetailView（后续实现）
    - _Requirements: R1.2_

- [ ] 11. 实现作品卡片组件
  - [ ] 11.1 创建 `src/components/WorkCard.tsx`
    - 显示封面图片（使用 convertFileSrc 转换路径）或占位图标
    - 显示作品名称、类型标签、状态标签、角色数量
    - 实现点击跳转到作品详情页
    - 实现快速操作按钮（编辑、删除）
    - 集成 ConfirmDialog 确认删除
    - 使用 shadcn/ui 组件（Card, Badge, Button）
    - _Requirements: R1.2, R1.4, R1.5, R2.1, R2.2, R7.6, R11.4_

- [ ] 12. 实现作品编辑对话框
  - [ ] 12.1 创建 `src/components/WorkEditModal.tsx`
    - 实现表单字段：名称（必填）、类型（下拉选择）、状态、描述、发布日期、制作方、导演/作者
    - 实现封面图片上传（文件选择器，预览）
    - 实现标签选择器（复用现有标签系统）
    - 实现表单验证（必填字段检查）
    - 实现保存和取消操作
    - 支持创建和编辑两种模式
    - 使用 shadcn/ui 组件（Dialog, Input, Select, Button）
    - _Requirements: R1.1, R1.4, R1.6, R1.7, R2.1, R2.2, R10.5, R11.3_

- [ ] 13. 实现作品详情视图
  - [ ] 13.1 创建 `src/components/WorkDetailView.tsx`
    - 实现左右分栏布局（左侧作品信息，右侧角色列表）
    - 左侧面板：显示封面、基本信息、标签、统计信息
    - 右侧面板：显示角色列表，添加角色按钮
    - 实现内联编辑功能（点击编辑图标打开 WorkEditModal）
    - 集成 CharacterEditModal 和 CharacterCard
    - 使用 useWorksStore 和 useCharactersStore
    - _Requirements: R1.3, R7.1, R7.2, R7.3, R7.4, R7.6_

- [ ] 14. 实现角色编辑对话框
  - [ ] 14.1 创建 `src/components/CharacterEditModal.tsx`
    - 实现表单字段：名称（必填）、类型、描述、出场信息
    - 实现 IP 选择器（下拉选择，可选，显示 IP 头像和名称）
    - 实现 IP 关联说明字段
    - 实现角色图片上传（支持多图，预览）
    - 实现表单验证
    - 实现保存和取消操作
    - 支持创建和编辑两种模式
    - _Requirements: R3.1, R3.3, R3.5, R3.7, R4.1, R5.1, R5.2, R5.3, R10.5_

- [ ] 15. 实现角色卡片组件
  - [ ] 15.1 创建 `src/components/CharacterCard.tsx`
    - 显示角色图片（第一张或占位图标）、名称、类型标签
    - 显示关联的 IP 信息（头像、名称，可点击跳转）
    - 实现展开/折叠功能（显示完整描述和所有图片）
    - 实现编辑和删除按钮
    - 实现拖拽排序支持（使用 HTML5 drag API 或库）
    - 使用 shadcn/ui 组件（Card, Badge, Button）
    - _Requirements: R3.2, R3.3, R3.4, R3.6, R4.1, R4.2, R5.6, R5.7, R7.5_

- [ ] 16. 实现搜索和筛选功能
  - [ ] 16.1 完善 WorksView 中的筛选逻辑
    - 实现实时搜索（输入框 onChange 触发 setFilters）
    - 实现类型筛选下拉菜单（所有作品类型选项）
    - 实现状态筛选下拉菜单（所有作品状态选项）
    - 实现标签筛选（多选，使用现有标签组件）
    - 实现排序选项（创建时间、更新时间、发布日期、名称，升序/降序）
    - 实现多条件组合筛选（所有条件同时生效）
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6_

- [ ] 17. 集成到应用导航
  - [ ] 17.1 在 IP 侧边栏添加作品集导航项
    - 在 `src/components/IpSidebar.tsx` 中添加"作品集"导航项
    - 添加合适的图标（使用 lucide-react，如 FileText 或 Film）
    - 实现点击跳转到 `/works` 路由
    - 高亮当前激活的导航项
    - _Requirements: R1.2_

- [ ] 18. 实现 IP 详情页集成（可选功能）
  - [ ] 18.1 在 IP 详情页添加"相关作品"标签页
    - 在 `src/components/IpArchivedView.tsx` 中添加新的标签页
    - 调用 getIpCharacters API 获取该 IP 的所有角色
    - 显示角色列表，每个角色卡片显示作品信息和角色信息
    - 实现点击跳转到作品详情页
    - 添加配置开关控制是否显示此标签页（在 useUIStore 中）
    - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5_

- [ ] 19. 完善样式和响应式布局
  - [ ] 19.1 优化作品集组件的样式
    - 确保所有组件使用 Tailwind CSS 工具类
    - 确保深色模式支持（使用 dark: 前缀）
    - 实现响应式布局（网格列数根据窗口大小调整）
    - 添加动画效果（展开/折叠使用 transition，拖拽使用视觉反馈）
    - 确保与现有 UI 风格一致（使用 shadcn/ui 组件）
    - _Requirements: R11.1, R11.7, NFR4_

- [ ] 20. 实现错误处理和用户反馈
  - [ ] 20.1 添加完整的用户反馈机制
    - 为所有操作添加 Toast 通知（成功/失败，使用 useToast hook）
    - 为删除操作添加确认对话框（使用 ConfirmDialog 组件）
    - 为加载状态添加 Skeleton 组件或加载指示器
    - 添加错误边界处理（React Error Boundary）
    - 完善空状态提示（无作品、无角色时显示友好提示）
    - _Requirements: R11.2, R11.3, R11.4, R11.5, R11.6_

- [ ] 21. 性能优化
  - [ ] 21.1 优化图片加载和数据库查询
    - 实现图片懒加载（使用 Intersection Observer 或库）
    - 优化大图片上传（前端压缩或后端压缩）
    - 验证数据库索引是否生效（检查查询计划）
    - 测试大数据量场景（100+ 作品）的性能
    - _Requirements: R12.1, R12.2, R12.3, R12.4, R12.5_

- [ ] 22. 最终测试和验收
  - [ ] 22.1 执行完整的功能测试
    - 测试场景 1：创建完整的作品（包含封面、标签）
    - 测试场景 2：为作品添加角色（包含图片、IP 关联）
    - 测试场景 3：关联 IP 到角色并验证跳转
    - 测试场景 4：搜索和筛选作品（多条件组合）
    - 测试场景 5：删除作品并验证文件清理
    - 测试所有 CRUD 操作的数据完整性
    - 测试软删除和级联删除逻辑
    - 修复发现的所有 bug
    - _Requirements: 所有需求的验收测试场景_

- [ ] 23. Checkpoint - 最终验收
  - 确保所有测试通过
  - 确保无编译错误和运行时错误
  - 确保 UI 响应流畅，无明显性能问题
  - 询问用户是否有其他需求或调整

## Notes

- 本任务列表按照依赖关系组织，必须按顺序执行（数据库 → 后端 → 前端）
- 每个任务都是可独立执行的编码任务，包含具体的文件路径和实现细节
- 任务引用了具体的需求编号（Requirements），确保需求覆盖完整
- Checkpoint 任务用于阶段性验证，确保增量开发的正确性
- 所有文件路径都是绝对路径或相对于项目根目录的路径
- 复用现有的标签系统、UI 组件和工具函数，保持代码一致性
- 遵循项目现有的代码风格和架构模式（参考 tech.md 和 structure.md）

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["8.1", "8.2"] },
    { "id": 6, "tasks": ["9.1", "9.2"] },
    { "id": 7, "tasks": ["10.1", "11.1", "12.1"] },
    { "id": 8, "tasks": ["10.2", "13.1", "14.1", "15.1"] },
    { "id": 9, "tasks": ["16.1", "17.1"] },
    { "id": 10, "tasks": ["18.1", "19.1", "20.1"] },
    { "id": 11, "tasks": ["21.1"] },
    { "id": 12, "tasks": ["22.1"] }
  ]
}
```
