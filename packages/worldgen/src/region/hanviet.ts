// Âm Hán-Việt cho bộ chữ của kiểu đặt tên `eastern` trong Cartographer (ADR 0007).
// Phủ: EAST_POOL, EAST_HEAD, EAST_CITY, EAST_CAPITAL, hậu tố địa lý của EASTERN, REALM_EASTERN, BAY.
// Chữ giản thể vì Cartographer ghi tên `zh` bằng giản thể.

const TABLE: Record<string, string> = {
  // EAST_POOL
  青: 'thanh', 苍: 'thương', 玄: 'huyền', 赤: 'xích', 碧: 'bích', 金: 'kim', 朔: 'sóc', 岚: 'lam', 澜: 'lan', 岐: 'kỳ',
  雍: 'ung', 凉: 'lương', 幽: 'u', 冀: 'ký', 扬: 'dương', 荆: 'kinh', 豫: 'dự', 梁: 'lương', 蜀: 'thục', 越: 'việt',
  吴: 'ngô', 楚: 'sở', 燕: 'yên', 赵: 'triệu', 秦: 'tần', 晋: 'tấn', 齐: 'tề', 鲁: 'lỗ', 云: 'vân', 龙: 'long',
  凤: 'phượng', 鹤: 'hạc', 松: 'tùng', 霜: 'sương', 雪: 'tuyết', 月: 'nguyệt', 星: 'tinh', 辰: 'thần', 阳: 'dương', 安: 'an',
  平: 'bình', 宁: 'ninh', 定: 'định', 康: 'khang', 永: 'vĩnh', 昌: 'xương', 兴: 'hưng', 丰: 'phong', 泰: 'thái', 华: 'hoa',
  洛: 'lạc', 渭: 'vị', 沅: 'nguyên', 湘: 'tương', 沧: 'thương', 澄: 'trừng', 清: 'thanh', 明: 'minh', 灵: 'linh', 翠: 'thúy',
  琅: 'lang', 临: 'lâm', 淮: 'hoài', 昆: 'côn', 衡: 'hành', 嵩: 'tung', 岱: 'đại', 紫: 'tử', 丹: 'đan', 玉: 'ngọc',
  瑶: 'dao', 琼: 'quỳnh', 溪: 'khê', 泉: 'tuyền', 浦: 'phố', 汀: 'đinh', 望: 'vọng', 归: 'quy', 远: 'viễn', 怀: 'hoài',
  武: 'vũ', 威: 'uy', 鹿: 'lộc', 梧: 'ngô', 白: 'bạch', 江: 'giang', 天: 'thiên', 长: 'trường',
  // EAST_HEAD, EAST_CITY, EAST_CAPITAL
  东: 'đông', 西: 'tây', 南: 'nam', 北: 'bắc',
  城: 'thành', 州: 'châu', 陵: 'lăng', 关: 'quan', 渡: 'độ', 川: 'xuyên',
  京: 'kinh', 都: 'đô',
  // Hậu tố địa lý (EASTERN), tên nước (REALM_EASTERN), vịnh (BAY)
  洲: 'châu', 岛: 'đảo', 屿: 'tự', 洋: 'dương', 海: 'hải', 山: 'sơn', 岭: 'lĩnh', 脉: 'mạch', 盆: 'bồn', 地: 'địa',
  原: 'nguyên', 大: 'đại', 漠: 'mạc', 沙: 'sa', 林: 'lâm', 湖: 'hồ', 泽: 'trạch', 盐: 'diêm', 池: 'trì',
  国: 'quốc', 朝: 'triều', 护: 'hộ', 府: 'phủ', 湾: 'loan',
  // Dự phòng cho tên sông nếu có
  河: 'hà', 水: 'thủy',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Đổi tên chữ Hán sang Hán-Việt, viết hoa mỗi âm tiết. Có chữ ngoài bảng thì trả null. */
export function toHanViet(han: string): string | null {
  const out: string[] = [];
  for (const ch of han) {
    const s = TABLE[ch];
    if (!s) return null;
    out.push(capitalize(s));
  }
  return out.length ? out.join(' ') : null;
}

export const HANVIET_CHARS: readonly string[] = Object.keys(TABLE);
