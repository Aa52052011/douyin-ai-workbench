import ExcelJS from 'exceljs';

/** Official 内容管理 → 作品列表导出.xlsx headers. Titles in rows are sanitized. */
export const DOUYIN_WORK_LIST_HEADERS = [
  '作品名称',
  '发布时间',
  '体裁',
  '审核状态',
  '播放量',
  '完播率',
  '5s完播率',
  '封面点击率',
  '2s跳出率',
  '平均播放时长',
  '点赞量',
  '分享量',
  '评论量',
  '收藏量',
  '主页访问量',
  '粉丝增量',
] as const;

export async function buildDouyinWorkListExportFixture(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('作品列表');
  sheet.addRow([...DOUYIN_WORK_LIST_HEADERS]);
  sheet.addRow([
    '示例作品A',
    '2026-08-01 10:00:00',
    '视频',
    '公开',
    961,
    '-',
    '-',
    '-',
    '-',
    '-',
    34,
    9,
    10,
    3,
    '-',
    '-',
  ]);
  sheet.addRow([
    '示例作品B',
    '2026-08-02 09:00:00',
    '视频',
    '公开',
    1200,
    '12.00%',
    '80.00%',
    '6.00%',
    '18.00%',
    '33.00s',
    40,
    8,
    6,
    4,
    '99',
    2,
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
