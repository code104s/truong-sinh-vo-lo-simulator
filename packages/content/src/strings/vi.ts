// Chuỗi giao diện tiếng Việt, khóa–giá trị (file do nhánh FE sở hữu). {tên} là chỗ điền tham số.
export const VI: Readonly<Record<string, string>> = {
  // —— Chung ——
  'ui.title': 'Trường Sinh Vô Lộ',
  'ui.title_han': '長生無路',
  'ui.close': 'Đóng',
  'ui.subtitle': 'Một đời, một mạng.',
  'ui.version': 'bản thử v0.1',
  'ui.error': 'Có lỗi: {message}',
  'ui.back': 'Về màn chính',

  // —— Màn chính ——
  'ui.menu.new': 'Đời mới',
  'ui.menu.continue': 'Tiếp tục',
  'ui.menu.continue_none': 'Chưa có đời nào đang dở',
  'ui.menu.lives': 'Sổ các đời',
  'ui.menu.lives_soon': 'Sẽ có ở bản sau',
  'ui.menu.settings': 'Thiết lập',
  'ui.menu.booting': 'Đang khởi động lõi mô phỏng…',

  // —— Thiết lập ——
  'ui.settings.title': 'Thiết lập',
  'ui.settings.seed': 'Hạt giống thế giới',
  'ui.settings.seed_hint': 'Để trống để chọn ngẫu nhiên. Cùng hạt giống và cùng nơi sinh thì cùng một đời.',
  'ui.settings.clear': 'Xóa đời đang dở',
  'ui.settings.cleared': 'Đã xóa.',
  'ui.settings.done': 'Xong',
  'ui.settings.music': 'Nhạc nền',
  'ui.settings.volume': 'Âm lượng',
  'ui.music.on': 'Tắt nhạc nền',
  'ui.music.off': 'Bật nhạc nền',

  // —— Sinh thế giới ——
  'ui.loading.title': 'Trời đất sơ khai',
  'progress.worldgen': 'Đang tạo núi sông…',
  'progress.region': 'Đang khoanh vùng, đặt làng mạc…',
  'ui.loading.seed': 'Hạt giống: {seed}',

  // —— Chọn nơi sinh ——
  'ui.birthplace.title': 'Chọn nơi sinh',
  'ui.birthplace.hint': 'Kéo để di chuyển, cuộn để phóng to. Bấm vào một làng, trấn hay thành.',
  'ui.birthplace.none': 'Chưa chọn nơi sinh.',
  'ui.birthplace.confirm': 'Sinh ra ở {name}',
  'ui.birthplace.fate': 'Xuất thân, thiên phú và mọi thứ khác do trời định.',
  'ui.region.realm': 'Thuộc {realm}',
  'ui.region.area': 'Rộng chừng {km2} km²',
  'ui.region.seed': 'Hạt giống {seed}',
  'kind.village': 'Làng',
  'kind.town': 'Trấn',
  'kind.city': 'Thành',

  // —— Đời người ——
  'ui.life.age': '{age} tuổi',
  'ui.life.born': 'Sinh tại {place}',
  'ui.life.background': 'Xuất thân',
  'ui.life.personality': 'Tính cách',
  'ui.life.constitution': 'Thể chất',
  'ui.life.aptitude': 'Ngộ tính',
  'ui.life.traits': 'Thiên phú',
  'ui.life.traits_none': 'Không có gì đặc biệt',
  'ui.life.health': 'Sức khỏe',
  'ui.life.conditions': 'Bệnh tật',
  'ui.life.conditions_none': 'Không',
  'ui.life.log': 'Nhật ký',
  'ui.life.character': 'Nhân vật',
  'ui.life.chronicle': 'Biên niên',
  'ui.life.saved': 'Đã tự lưu',
  'ui.ctrl.pause': 'Tạm dừng',
  'ui.ctrl.week': '+1 tuần',
  'ui.ctrl.month': '+1 tháng',
  'ui.ctrl.year': '+1 năm',
  'ui.ctrl.until': 'Tua tới khi có biến',
  'ui.ctrl.running': 'Thời gian đang trôi…',
  'ui.interrupt': 'Có biến',
  'gender.male': 'Nam',
  'gender.female': 'Nữ',

  // —— Lịch ——
  'date.full': 'Năm {year} · {month} · {tenDay}',
  'date.short': 'Năm {year}, {month}',
  'month.1': 'tháng Giêng', 'month.2': 'tháng Hai', 'month.3': 'tháng Ba', 'month.4': 'tháng Tư',
  'month.5': 'tháng Năm', 'month.6': 'tháng Sáu', 'month.7': 'tháng Bảy', 'month.8': 'tháng Tám',
  'month.9': 'tháng Chín', 'month.10': 'tháng Mười', 'month.11': 'tháng Một', 'month.12': 'tháng Chạp',
  'tenday.0': 'thượng tuần', 'tenday.1': 'trung tuần', 'tenday.2': 'hạ tuần',
  'season.spring': 'Xuân', 'season.summer': 'Hạ', 'season.autumn': 'Thu', 'season.winter': 'Đông',

  // —— Thuộc tính ——
  'background.destitute': 'bần hàn', 'background.commoner': 'bình dân', 'background.comfortable': 'khá giả', 'background.wealthy': 'giàu có',
  'personality.righteous': 'Chính trực', 'personality.calm': 'Trầm ổn', 'personality.hot_tempered': 'Nóng nảy', 'personality.cunning': 'Xảo quyệt',
  'personality.kind': 'Nhân hậu', 'personality.aloof': 'Cô ngạo', 'personality.ambitious': 'Dã tâm', 'personality.cheerful': 'Hoạt bát',
  'personality.timid': 'Nhút nhát', 'personality.eccentric': 'Quái gở', 'personality.loyal': 'Trung thành', 'personality.greedy': 'Tham lam',
  'constitution.frail': 'Yếu ớt', 'constitution.weak': 'Hơi yếu', 'constitution.average': 'Bình thường', 'constitution.sturdy': 'Rắn rỏi', 'constitution.robust': 'Cường tráng',
  'aptitude.dull': 'Chậm hiểu', 'aptitude.slow': 'Hơi chậm', 'aptitude.average': 'Bình thường', 'aptitude.bright': 'Sáng dạ', 'aptitude.gifted': 'Thông tuệ',
  'trait.hardy': 'Gân cốt rắn chắc', 'trait.sickly': 'Bẩm sinh yếu ớt', 'trait.nimble': 'Nhanh nhẹn', 'trait.clumsy': 'Vụng về', 'trait.keen_memory': 'Nhớ lâu',

  // —— Sức khỏe ——
  'health.robust': 'Cường tráng', 'health.healthy': 'Khỏe mạnh', 'health.weak': 'Yếu', 'health.ill': 'Ốm nặng', 'health.dying': 'Thoi thóp',
  'severity.mild': 'nhẹ', 'severity.serious': 'nặng', 'severity.grave': 'nguy kịch',
  'illness.cold': 'cảm hàn', 'illness.fever': 'sốt rét', 'illness.dysentery': 'kiết lỵ', 'illness.consumption': 'lao phổi', 'illness.stroke': 'trúng phong',
  'injury.wound': 'vết thương', 'injury.fracture': 'gãy xương',

  // —— Cái chết ——
  'death.old_age': 'già yếu', 'death.illness': 'bệnh', 'death.accident': 'tai nạn',
  'death.starvation': 'đói', 'death.violence': 'bạo lực', 'death.disaster': 'thiên tai',
  'old_age.natural': 'thọ chung chính tẩm', 'accident.fatal': 'tai nạn bất ngờ',

  // —— Nhật ký ——
  'log.birth': 'Cất tiếng khóc chào đời ở {birthplace}, trong một nhà {background}.',
  'log.illness.onset': '{age} tuổi, mắc {illness}.',
  'log.illness.recovered': 'Khỏi {illness}.',
  'log.illness.recovered.scar': 'Khỏi {illness}, nhưng thân thể không còn như trước.',
  'log.injury.onset': '{age} tuổi, bị {injury}.',
  'log.injury.recovered': 'Lành {injury}.',
  'log.injury.recovered.scar': 'Lành {injury}, để lại tật.',
  'log.age.milestone': 'Tròn {age} tuổi.',
  'log.health.worse': 'Sức khỏe sa sút: {band}.',
  'log.death': 'Qua đời năm {age} tuổi. Nguyên do: {detail}.',

  // —— Tổng kết ——
  'ui.summary.title': 'Một đời khép lại',
  'ui.summary.lived': 'Sống {age} năm',
  'ui.summary.span': 'Từ {from} đến {to}',
  'ui.summary.cause': 'Nguyên do: {cause} ({detail})',
  'ui.summary.place': 'Sinh ra ở {place}',
  'ui.summary.milestones': 'Những mốc trong đời',
  'ui.summary.digest': 'Dấu đời (digest): {digest}',
};
