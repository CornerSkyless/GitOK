# macOS 签名发布

Release 工作流只接受与 `package.json` 一致、已合入 `main` 的 `vX.Y.Z` 标签，并要求存在对应的用户发布说明。

## 首次配置（在自己的 Mac 上操作）

1. 在 Xcode → Settings → Accounts 中登录付费 Apple Developer 账号，选择所属团队，在 Manage Certificates 中创建 **Developer ID Application** 证书。也可按 [Apple 的证书说明](https://developer.apple.com/help/account/certificates/create-developer-id-certificates)创建。不要选择 Apple Development、Apple Distribution 或 Developer ID Installer。
2. 打开“钥匙串访问”→“我的证书”，确认该证书下包含私钥。选择这一个身份，导出为密码保护的 `.p12`；将文件保存在仓库外。
3. 在 [Apple 账号](https://account.apple.com/)的“登录与安全”中生成一个专供 GitOK 使用的应用专用密码。这里使用应用专用密码，不是账号登录密码。它可单独撤销。
4. 在 Apple Developer 账号的 Membership details 中找到 10 位 Team ID，必须与证书所属团队一致。
5. 在本机终端、项目根目录运行：

   ```bash
   bash .github/signing/configure-secrets.sh
   ```

   脚本固定上传到 `CornerSkyless/GitOK` 的 `apple-release` 环境，通过隐藏输入读取两项密码；凭据通过标准输入传给 GitHub CLI，不写入代码或临时文本文件。不要把 `.p12`、Base64 或密码发到聊天里。

也可在 [仓库 Environments 设置](https://github.com/CornerSkyless/GitOK/settings/environments)选择 `apple-release`，手动添加以下 **Environment secrets**（不是 Repository secrets）：

| Secret                         | 内容                                  |
| ------------------------------ | ------------------------------------- |
| `APPLE_CERTIFICATE_P12_BASE64` | 包含证书和私钥的 `.p12` 文件的 Base64 |
| `APPLE_CERTIFICATE_PASSWORD`   | 导出 `.p12` 时设置的密码              |
| `APPLE_ID`                     | 用于公证的 Apple 账号邮箱             |
| `APPLE_TEAM_ID`                | 证书所属的 10 位 Team ID              |
| `APPLE_APP_SPECIFIC_PASSWORD`  | 专供 GitOK 使用的 Apple 应用专用密码  |

## 发布流程

- `build`：两个架构在独立的 GitHub 托管 macOS Runner 中编译；没有 Apple 凭据，输出保留符号链接的未签名 ZIP。
- `sign`：在全新 Runner 中等待 `apple-release` 审批。检查标签来源，然后只安装独立锁文件中的官方签名工具，使用 `--ignore-scripts`；不安装项目依赖或运行应用代码。Apple Secrets 仅注入签名步骤。
- 凭据导入临时钥匙串后从子进程环境中清除；两个架构均使用 Developer ID 和 hardened runtime 签名，提交 Apple 公证并装订票据。ZIP 在 app 装订后重新制作，DMG 也单独签名、公证、装订。
- 发布前检查应用标识、版本、CPU 架构、签名所属团队、严格签名验证、票据及 Gatekeeper。最终 ZIP 解压后再次校验。
- 任务退出时删除临时私钥文件及钥匙串，并有 `always()` 清理步骤。只上传最终 ZIP、DMG 和 `SHA256SUMS`；原始 app、钥匙串及凭据不进入 Release。
- `release`：在无 Apple 凭据的 Linux Runner 中验证四个安装包及校验和，全部成功后才创建 GitHub Release。

`apple-release` 限制为 `v*` 标签，审批人为 `CornerSkyless`，禁止管理员跳过保护规则。当前为单人维护，允许发起者手动批准自己的发布。批准前核对 tag、commit 和工作流改动；GitHub Secrets 无法防止已获准的恶意工作流窃取凭据。新增维护者后可启用禁止自审。

## 当前版本与下一次发布

不要移动已经发布的 `v1.3.4` 标签，也不要重跑旧标签的工作流来获得本次修复。凭据配置完成后，将版本更新为 `1.3.5`，添加 `.github/release-notes/v1.3.5.md`，提交到 `main` 后推送新标签 `v1.3.5`。

在 Actions 中打开该次 Release，检查源提交后由你点击 Review deployments 批准 `apple-release`。缺少凭据、证书过期、团队不匹配、公证失败或校验失败都会阻止发布，不会退回未签名包。

Apple 首次公证可能耗时较长；每次提交最多等待 30 分钟。超时后先在 Apple 公证服务中核查处理状态，避免反复提交。已发布包仍需实际从浏览器下载、安装并打开验收；CI 的 Gatekeeper 校验不能替代首次下载的验证。
