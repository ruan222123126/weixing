# 微信小程序报销系统（首版后端骨架）

基于微信云开发的云函数实现，覆盖：
- 报销申请/提交/审批
- 纸质报销登记（手工 + Excel 导入）
- 月度统计导出（Excel）
- 项目结算（利润与提成自动计算）

## 目录结构

```text
cloudfunctions/
  _shared/                   # 共享业务层
  authLogin/
  createOrUpdateClaim/
  submitClaim/
  approveClaim/
  importPaperClaims/
  pullErpRevenue/
  generateMonthlyReport/
  generateProjectSettlement/
  getSettlementDetail/
  listClaims/
  listProjects/
  getClaimDetail/
  upsertProject/
  upsertProjectPeriodData/
miniprogram/
  pages/                     # 小程序页面（员工端 + 财务端）
  utils/
docs/
  api.md
  templates/paper_claims_template.csv
tests/
```

## 本地测试

```bash
npm install
npm test
```

## 云函数部署建议

1. 先执行 `npm run prepare:cloudfunctions`，会自动把 `_shared` 同步到每个函数目录，并补齐函数依赖。
2. 在微信开发者工具中，逐个函数目录执行“创建并部署：所有文件（云端安装依赖）”。
3. 配置环境变量（按需）：
   - `ERP_ENDPOINT`
   - `ERP_TOKEN`
   - `FINANCE_PHONES`（逗号分隔，登录后自动开通财务角色）
   - `ADMIN_PHONES`（逗号分隔）

## 小程序前端接入

1. 打开微信开发者工具，导入项目根目录 `/mnt/Files/weixing`。
2. 在 `miniprogram/app.js` 修改 `envId` 为你的云环境 ID。
3. 在终端执行 `npm run prepare:cloudfunctions` 后，再在开发者工具中上传并部署 `cloudfunctions` 下全部函数。
4. 运行小程序，先在登录页创建用户。
5. 建议配置 `FINANCE_PHONES` / `ADMIN_PHONES`，登录后自动开通对应角色。

## 页面路径（已接入）

- 员工端:
  - `/pages/claim-form/index`
  - `/pages/my-claims/index`
  - `/pages/claim-detail/index`
- 财务端:
  - `/pages/finance-dashboard/index`
  - `/pages/finance-projects/index`
  - `/pages/finance-approve/index`
  - `/pages/finance-paper/index`
  - `/pages/finance-report/index`
  - `/pages/finance-settlement/index`

## 关键业务规则

1. 报销单只有 `draft/rejected` 可编辑。
2. 一级审批固定为财务审批。
3. 纸质导入按 `period` 严格校验，跨月数据会报错。
4. 项目结算公式：

```text
利润 = 收入 - 报销成本 - 税费 - 人工摊销
```

5. 默认提成分档：

```text
<10%:0%; 10-20%:5%; 20-30%:8%; >=30%:12%
```

## 说明

这个版本重点是把流程闭环先跑起来，方便后续接入小程序页面和 ERP 真接口。
