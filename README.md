# GitOK - Git 状态监控器

一个基于 Electron 的桌面应用，用于监控本地目录下所有项目的 Git 状态。

## 开发工具

这个应用完全是通过 [Cursor](https://cursor.sh/) 进行开发的。除了部分配置文件外，所有的代码都由 AI 生成，展示了 AI 辅助编程的强大能力。Cursor 的 AI 功能帮助我们快速构建了这个功能完整的 Git 状态监控应用。（甚至这句话也是指使 Cursor 写的）

## 功能特性

- 🗂️ **目录监听**: 选择要监听的根目录，自动扫描一级子文件夹
- 🔍 **Git 状态检查**: 自动检测每个子目录是否为 Git 仓库
- 📊 **状态概览**: 显示每个项目的详细 Git 状态信息
- 🔄 **实时刷新**: 手动刷新状态，获取最新的 Git 信息
- 🎨 **现代化 UI**: 美观的用户界面，支持响应式设计

## Git 状态信息

应用会显示以下 Git 状态信息：

- ✅ **同步**: 本地与远程完全同步
- ⚠️ **有未提交的更改**: 存在未提交的修改
- ⬆️ **未推送**: 有本地提交但未推送到远程
- ⬆️ **领先远程**: 本地提交领先远程分支
- ⬇️ **落后远程**: 本地分支落后远程分支
- ❌ **非 Git 仓库**: 该目录不是 Git 仓库

## 安装和运行

### 环境要求

- Node.js 18+
- Git 已安装并配置

### 开发环境

1. 克隆项目
```bash
git clone <repository-url>
cd gitok
```

2. 安装依赖
```bash
npm install
# 或者使用 yarn
yarn install
```

3. 启动开发模式
```bash
npm run dev
# 或者使用 yarn
yarn dev
```

### 构建应用

```bash
# 构建所有平台
npm run build

# 构建特定平台
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## 使用方法

1. 启动应用后，点击"选择目录"按钮
2. 选择要监听的根目录（包含多个项目的目录）
3. 应用会自动扫描该目录下的一级子文件夹
4. 查看每个项目的 Git 状态信息
5. 使用"刷新状态"按钮获取最新状态

## 技术栈

- **前端**: React 19 + TypeScript
- **桌面框架**: Electron
- **构建工具**: Vite + Electron Vite
- **样式**: CSS3 + 响应式设计

## 项目结构

```
src/
├── main/           # Electron 主进程
├── preload/        # 预加载脚本
└── renderer/       # React 渲染进程
    ├── components/ # React 组件
    └── assets/     # 样式和资源文件
```

## 开发说明

- 主进程负责文件系统操作和 Git 命令执行
- 渲染进程提供用户界面和状态管理
- 通过 IPC 通信实现主进程和渲染进程的数据交换



## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
