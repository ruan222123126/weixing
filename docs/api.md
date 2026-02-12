# 云函数接口说明（首版）

## 1. authLogin
- 入参: `openid?`, `phone?`, `name?`
- 返回: 用户基础信息（`userId`, `role` 等）
- 说明: 支持按手机号白名单自动开通角色（`FINANCE_PHONES` / `ADMIN_PHONES`）

## 2. createOrUpdateClaim
- 入参:
  - 创建: `projectId`, `claimType`, `occurDate`, `items[]`
  - 更新: 额外带 `claimId`
- 说明: 仅 `draft/rejected` 可编辑

## 3. submitClaim
- 入参: `claimId`
- 说明: 提交后状态变为 `submitted`

## 4. approveClaim
- 入参: `claimId`, `action=approve|reject|void`, `reason?`
- 说明: 仅财务/管理员可调用

## 5. importPaperClaims
- 入参:
  - `period` (YYYY-MM)
  - `rows[]` 或 `fileBase64`
  - `mode=excel|manual`
- 说明: 导入后自动写入 `approved` 纸质报销单

## 6. pullErpRevenue
- 入参:
  - `period`
  - `rows[]`（测试）或 `endpoint/token`（实际）
- 说明: 写入或更新 `project_revenue`

## 7. generateMonthlyReport
- 入参: `period`, `projectId?`, `includeFile?`
- 返回: `fileBase64`（Excel）+ 统计信息

## 8. generateProjectSettlement
- 入参: `projectId`, `period`
- 说明: 缺少收入/税费/人工摊销任一数据会拒绝结算

## 9. getSettlementDetail
- 入参: `settlementId` 或 `projectId+period`

## 10. listClaims
- 入参: `scope=mine|pending|all`, `status?`, `projectId?`, `period?`
- 说明:
  - `mine`: 当前用户报销列表
  - `pending`: 财务待审批列表

## 11. getClaimDetail
- 入参: `claimId`
- 返回: 报销单 + 明细列表

## 12. upsertProjectPeriodData
- 入参: `projectId`, `period`, `laborAmount`, `taxFeeAmount`
- 说明: 财务维护结算所需的人工摊销与税费数据

## 13. listProjects
- 入参: `keyword?`, `includeDisabled?`
- 说明: 返回项目列表，供小程序下拉选择

## 14. upsertProject
- 入参: `projectId`, `name`, `owner?`, `status=active|archived|disabled`
- 说明: 财务/管理员新增或更新项目主数据

## 通用错误结构
```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "错误描述",
    "statusCode": 400,
    "details": null
  }
}
```
