# 作品集功能开发任务

## Task 1: 数据库层实现
创建数据库表结构和基础操作函数

### Sub-tasks:
- 在 `src-tauri/src/database/mod.rs` 中添加 works、characters、work_tags 表的创建语句
- 添加数据库迁移逻辑
- 实现 works 表的 CRUD 操作函数
- 实现 characters 表的 CRUD 操作函数
- 实现 work_tags 表的关联操作函数
- 添加必要的索引

## Task 2: 后端数据模型定义
定义 Rust 数据结构

### Sub-tasks:
- 在 `src-tauri/src/models/mod.rs` 中添加 Work、Character、WorkWithRelations、CharacterWithRelations 结构体
- 实现 Serialize 和 Deserialize trait
- 添加类型枚举（WorkType、WorkStatus、CharacterType）

## Task 3: 作品管理命令实现
实现作品相关的 Tauri 命令

### Sub-tasks:
- 创建 `src-tauri/src/commands/works.rs`
- 实现 create_work 命令
- 实现 get_works 命令（支持筛选）
- 实现 get_work_by_id 命令
- 实现 update_work 命令
- 实现 delete_work 命令（软删除）
- 实现作品标签管理命令
- 在 lib.rs 中注册命令

## Task 4: 角色管理命令实现
实现角色相关的 Tauri 命令

### Sub-tasks:
- 创建 `src-tauri/src/commands/characters.rs`
- 实现 create_character 命令
- 实现 get_characters 命令
- 实现 get_character_by_id 命令
- 实现 update_character 命令
- 实现 delete_character 命令（软删除）
- 实现 update_character_order 命令
- 在 lib.rs 中注册命令

## Task 5: 文件存储管理
实现作品和角色的图片存储

### Sub-tasks:
- 在 works.rs 中实现封面图片上传和删除
- 在 characters.rs 中实现角色图片上传和删除
- 实现文件清理逻辑（删除作品/角色时）
- 添加图片格式验证

## Task 6: 前端类型定义
定义 TypeScript 类型

### Sub-tasks:
- 在 `src/stores/index.ts` 中添加 Work、Character、WorkWithRelations、CharacterWithRelations 接口
- 添加类型枚举（WorkType、WorkStatus、CharacterType）
- 添加筛选和排序相关的类型

## Task 7: Tauri 命令包装
在前端服务层包装后端命令

### Sub-tasks:
- 在 `src/services/tauri.ts` 中添加作品相关的 API 函数
- 添加角色相关的 API 函数
- 添加错误处理

## Task 8: Zustand Store 实现
创建状态管理 Store

### Sub-tasks:
- 在 `src/stores/index.ts` 中创建 useWorksStore
- 实现作品的 CRUD actions
- 实现筛选和排序 actions
- 创建 useCharactersStore（如果需要独立管理）
- 实现角色的 CRUD actions

## Task 9: 作品列表视图
实现作品列表主界面

### Sub-tasks:
- 创建 `src/components/WorksView.tsx`
- 实现顶部工具栏（搜索、筛选、排序、新建按钮）
- 实现作品卡片网格布局
- 实现加载状态和空状态
- 添加到主应用路由

## Task 10: 作品卡片组件
实现作品卡片展示

### Sub-tasks:
- 创建 `src/components/WorkCard.tsx`
- 显示封面、名称、类型、状态、角色数量
- 实现快速操作按钮
- 实现点击跳转到详情页

## Task 11: 作品编辑对话框
实现作品创建和编辑界面

### Sub-tasks:
- 创建 `src/components/WorkEditModal.tsx`
- 实现表单字段（名称、类型、描述等）
- 实现封面图片上传
- 实现标签选择器
- 实现表单验证
- 实现保存和取消操作

## Task 12: 作品详情视图
实现作品详情页面

### Sub-tasks:
- 创建 `src/components/WorkDetailView.tsx`
- 实现左侧作品信息面板
- 实现右侧角色列表面板
- 实现内联编辑功能
- 实现角色添加按钮

## Task 13: 角色编辑对话框
实现角色创建和编辑界面

### Sub-tasks:
- 创建 `src/components/CharacterEditModal.tsx`
- 实现表单字段（名称、类型、描述等）
- 实现 IP 选择器（可选）
- 实现角色图片上传（多图）
- 实现表单验证
- 实现保存和取消操作

## Task 14: 角色卡片组件
实现角色卡片展示

### Sub-tasks:
- 创建 `src/components/CharacterCard.tsx`
- 显示角色信息和关联的 IP
- 实现展开/折叠功能
- 实现编辑和删除按钮
- 实现拖拽排序支持

## Task 15: 搜索和筛选功能
实现作品搜索和筛选

### Sub-tasks:
- 在 WorksView 中实现搜索框
- 实现类型筛选下拉菜单
- 实现状态筛选下拉菜单
- 实现标签筛选
- 实现排序选项
- 实现多条件组合筛选逻辑

## Task 16: IP 详情页集成（可选）
在 IP 详情页添加相关作品标签页

### Sub-tasks:
- 在 `src/components/IpArchivedView.tsx` 中添加"相关作品"标签页
- 实现获取 IP 相关角色的 API
- 显示角色列表（跨作品）
- 实现跳转到作品详情功能
- 添加配置开关控制显示

## Task 17: 导航集成
将作品集添加到应用导航

### Sub-tasks:
- 在 `src/App.tsx` 中添加作品集路由
- 在 IP 侧边栏中添加"作品集"导航项
- 实现路由跳转
- 添加图标

## Task 18: 样式和主题
完善界面样式

### Sub-tasks:
- 为作品集组件添加 Tailwind 样式
- 确保深色模式支持
- 实现响应式布局
- 添加动画效果（展开/折叠、拖拽等）

## Task 19: 错误处理和用户反馈
完善错误处理和用户提示

### Sub-tasks:
- 添加 Toast 通知（成功/失败）
- 添加确认对话框（删除操作）
- 添加加载状态提示
- 添加错误边界处理
- 完善空状态提示

## Task 20: 测试和优化
测试功能并优化性能

### Sub-tasks:
- 测试所有 CRUD 操作
- 测试 IP 关联功能
- 测试搜索和筛选
- 测试文件上传和删除
- 优化数据库查询
- 优化图片加载（懒加载）
- 修复发现的 bug
