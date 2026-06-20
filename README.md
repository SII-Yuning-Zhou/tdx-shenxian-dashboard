# 神线 GitHub Pages 加密看板

这是一个适合 GitHub Pages 免费托管的静态版看板。GitHub Pages 只提供静态网页，
所以访问密码不会发到服务器校验，而是在浏览器里用于本地解密 `public/data/latest.enc.json`。

## 工作方式

```text
通达信本机脚本
  -> 写出 tdx_shenxian_buy_alerts.json
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

## 安全注意

- 访问密码一定要足够长，建议至少 12-20 位，包含大小写、数字或符号。
- 不要把 `TDX_DASHBOARD_VIEW_PASSWORD` 写进代码或提交到 GitHub。
- GitHub 免费公开仓库的源码和加密数据都是公开的，安全性依赖访问密码强度。
- 如果怀疑密码泄漏，换一个新密码，重新生成 `latest.enc.json` 并推送。
