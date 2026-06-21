# 神线 GitHub Pages 加密看板

这是一个适合 GitHub Pages 免费托管的静态版看板。GitHub Pages 只提供静态网页，
所以访问密码不会发到服务器校验，而是在浏览器里用于本地解密 `public/data/latest.enc.json`。

## 工作方式

```text
通达信本机脚本
  -> 写出 output/live/tdx_shenxian_buy_alerts.json
  -> 使用 TDX_DASHBOARD_VIEW_PASSWORD 加密
  -> 生成 public/data/latest.enc.json
  -> git commit / push 到 GitHub
  -> GitHub Pages 发布 public/
```

公开仓库里只有加密后的数据文件。别人可以下载密文，但没有访问密码不能解密看到信号。

## 目录

- `public/`：GitHub Pages 发布目录。
- `public/data/latest.enc.json`：最新加密信号数据。
- `tools/encrypt_snapshot.mjs`：把本地 JSON 加密成 GitHub Pages 数据文件。
- `.github/workflows/pages.yml`：GitHub Actions 自动发布 Pages。

## 生成加密数据

先设置访问密码。这个密码就是用户打开网页时输入的密码：

```powershell
$env:TDX_DASHBOARD_VIEW_PASSWORD="换成你的强密码"
```

也可以把访问密码保存成本地文件，之后脚本会自动读取。这个文件只放在本机，并已加入
`.gitignore`：

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run password:save
```

默认保存位置是：

```text
F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard\dashboard.password.txt
```

读取优先级是：`TDX_DASHBOARD_VIEW_PASSWORD` 环境变量优先，其次读取
`dashboard.password.txt`。如果你想放到别的位置，可以设置：

```powershell
$env:TDX_DASHBOARD_PASSWORD_FILE="D:\private\tdx-dashboard-password.txt"
```

## 本地配置文件

更直观的本地配置文件是：

```text
F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard\dashboard.config.txt
```

它已经加入 `.gitignore`，不会上传到 GitHub。可以用记事本打开：

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run config:open
```

最常改的是这一行：

```text
AUTO_UPLOAD=1
```

- `AUTO_UPLOAD=1`：每次扫描后自动上传到 GitHub Pages。
- `AUTO_UPLOAD=0`：只更新本地加密文件，不上传 GitHub。

当前支持的配置项：

```text
AUTO_UPLOAD=1
UPLOAD_ONLY_ON_CHANGE=1
PASSWORD_FILE=dashboard.password.txt
GITHUB_REPO=SII-Yuning-Zhou/tdx-shenxian-dashboard
REMOTE_PATH=public/data/latest.enc.json
ENCRYPTED_JSON=public/data/latest.enc.json
UPLOAD_STATE_FILE=.cloud/latest.source.sha256
```

环境变量仍然优先于配置文件，方便临时覆盖。

手工加密当前信号：

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run encrypt
```

不想把密码显示在命令行里时，使用隐藏输入：

```powershell
npm run encrypt:prompt
```

也可以直接运行原来的通达信扫描脚本。只要设置了 `TDX_DASHBOARD_VIEW_PASSWORD`，
[tdx_shenxian_quant.py](../tdx_shenxian_quant.py) 每次写出本地 JSON 后会自动更新
`public/data/latest.enc.json`。

如果希望每次扫描写出新数据后自动上传到 GitHub Pages，再额外打开上传开关：

```powershell
$env:TDX_DASHBOARD_AUTO_UPLOAD="1"
```

打开这个开关后，脚本会在每次成功加密后自动调用 `tools/upload_encrypted_data.ps1`。
如果不设置这个变量，就只更新本地加密文件，不会上传。

可选：如果以后仓库地址或远端文件路径变化，可以覆盖默认值：

```powershell
$env:TDX_DASHBOARD_GITHUB_REPO="SII-Yuning-Zhou/tdx-shenxian-dashboard"
$env:TDX_DASHBOARD_REMOTE_PATH="public/data/latest.enc.json"
```

## 本地预览

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run preview
```

打开：

```text
http://127.0.0.1:8788
```

本地预览如果还没有真实加密数据，会回退到 `public/mock/latest.enc.json`。示例密码是：

```text
demo-password
```

## 发布到 GitHub Pages

1. 在 GitHub 创建一个公开仓库，例如 `tdx-shenxian-dashboard`。
2. 把 `F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard` 作为仓库根目录推送上去。
3. 在仓库页面进入 `Settings -> Pages`。
4. `Source` 选择 `GitHub Actions`。
5. 推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动发布 `public/`。

发布地址通常是：

```text
https://你的GitHub用户名.github.io/tdx-shenxian-dashboard/
```

## 每次更新数据

本机扫描产生新信号后：

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run encrypt:prompt
npm run upload:data
```

GitHub Pages 会自动更新网页。这个上传流程使用 GitHub CLI API，不依赖 `git push`。

如果已经在运行通达信扫描脚本的 PowerShell 窗口里设置了：

```powershell
$env:TDX_DASHBOARD_VIEW_PASSWORD="你的访问密码"
$env:TDX_DASHBOARD_AUTO_UPLOAD="1"
```

那么每次扫描完成写出新 JSON 后，会自动加密并上传到 GitHub，无需再手工执行
`npm run upload:data`。GitHub Pages 发布通常会有几十秒到一两分钟延迟。

更推荐的启动方式是使用隐藏密码输入脚本：

```powershell
cd F:\new_tdx64\PYPlugins\user\tdx-cloud-dashboard
npm run run:live:auto-upload
```

如果已经保存了 `dashboard.password.txt`，这个命令会直接读取本地密码文件；如果没有保存，
会要求输入网页访问密码，输入内容不会显示在屏幕上。然后它会以 `live` 模式运行
`tdx_shenxian_quant.py`，并按照 `dashboard.config.txt` 里的 `AUTO_UPLOAD` 决定是否上传。
只扫描一次可以用：

```powershell
npm run run:once:auto-upload
```

## 安全注意

- 访问密码一定要足够长，建议至少 12-20 位，包含大小写、数字或符号。
- 不要把 `TDX_DASHBOARD_VIEW_PASSWORD` 写进代码或提交到 GitHub。
- `dashboard.password.txt` 是本机明文密码文件，不要发给别人，也不要上传到网盘或 GitHub。
- GitHub 免费公开仓库的源码和加密数据都是公开的，安全性依赖访问密码强度。
- 如果怀疑密码泄漏，换一个新密码，重新生成 `latest.enc.json` 并推送。
