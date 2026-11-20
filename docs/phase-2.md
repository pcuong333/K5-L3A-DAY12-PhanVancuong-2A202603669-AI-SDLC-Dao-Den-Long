# Phase 2 — Ticket-02 “Ba hòn đảo”

## Mục tiêu

Chuẩn hóa điều khiển và mô phỏng theo Test Contract v1.1, sau đó mở rộng trò chơi thành ba Đêm có bản đồ riêng, Gió Lạc, Bùa Gió, gió mạnh, giao diện và luồng chơi mới. Quy tắc gameplay nằm trong `src/sim`; trình duyệt và CLI headless dùng chung `stepGame`.

## Số liệu chuẩn

| Hạng mục | Giá trị |
|---|---|
| Tick | 60 tick/giây; mét, giây; Y hướng lên |
| Chạy | 6.0 m/s; tăng tốc/dừng trong tối đa 0.1 s; điều khiển trên không hạn chế |
| Nhảy | 7.0 m/s; trọng lực −20 m/s²; chỉ khi chạm đất |
| Lướt | 14 m/s trong 0.2 s; hồi chiêu 1.5 s tính từ lúc bắt đầu; hướng di chuyển hoặc hướng nhìn; giữ cao độ trên không, không cho bất tử |
| Đom đóm | Sức chứa 10; nhặt khi XZ ≤ 1.0 m và chênh cao chân ≤ 1.5 m |
| Sinh đom đóm | 20 đom đóm ban đầu ở 20 điểm khác nhau; trần 30; mỗi 240 tick thử sinh 1 đom đóm ở điểm trống |
| Đèn | 10 đom đóm/đèn; tương tác ≤ 2.0 m theo khoảng cách 3D, nạp nhiều lần; chọn đèn chưa sáng gần nhất, hòa thì id nhỏ hơn |
| Tỏa Sáng | 3 đom đóm; bán kính 5 m tính 3D từ chân Mây + 0.8 m; hồi chiêu 3 s; choáng 120 tick và đẩy tổng 4 m trong 15 tick đầu |
| Bóng Mực | Tốc độ 4.0 m/s (Đêm 3: 4.5); phát hiện 12 m, bỏ đuổi 18 m; chạm XZ ≤ 1.0 m và chênh cao ≤ 1.5 m |
| Va chạm | Mất 1 Ngọn Lửa; rơi `floor(đang mang / 2)` đom đóm; bất tử 90 tick; tối đa một hit/tick |
| Rơi khỏi đảo | Y < −10; trừ 1 Ngọn Lửa và toàn bộ đom đóm, bỏ qua bất tử; hồi sinh sau 60 tick với vận tốc 0 và bất tử 90 tick |
| Đêm | 300 / 330 / 360 giây; 3 Ngọn Lửa đầu mỗi Đêm |
| Điểm | +10/đom đóm nạp, +100/đèn, +5/Bóng Mực trúng Tỏa Sáng, +2/giây còn lại khi thắng, +50/Ngọn Lửa còn lại |

### Bản đồ

- **Đêm 1 — Đảo Bến:** đảo tròn bán kính 40 m; xuất phát `(0,0,0)` nhìn +Z; 5 đèn theo tọa độ trong contract; 24 điểm sinh đom đóm (8 ở bán kính 12 m, 16 ở bán kính 33 m); 12 điểm sinh Bóng Mực ở bán kính 37 m.
- **Đêm 2 — Đảo Cau:** hai đảo bán kính 28 m, tâm `(0,0,0)` và `(70,0,0)`; cầu tre `x=[26,44]`, `z=[−2,2]`; hai bục nhảy bán kính 1 m phóng với vận tốc Y 14 m/s và ngang 24 m/s; 6 đèn.
- **Đêm 3 — Đảo Chuông:** đảo bán kính 45 m; tầng Y=3 là vành khăn r=12–24 m phía z>0; tầng Y=6 là đĩa r=8 m; hai dốc rộng 3 m; bục nhảy `(0,3,13)` phóng với Y 12 m/s và ngang 8 m/s theo −Z; tháp chuông bán kính 2 m, cao 8 m; 7 đèn.

## Tiêu chí nghiệm thu — Phần 3

| Tính năng | Tiêu chí có thể kiểm tra |
|---|---|
| Gió Lạc | Đêm 2–3 sinh tại tick 1200, 2400, …; tối đa 2; trạng thái idle/chase/flee/removed; idle 2 m/s, chase khi Mây mang ≥5 đom đóm trong 15 m, cướp `min(3, đang mang)` khi XZ ≤1.2 m, flee 7 m/s trong 240 tick; Tỏa Sáng làm Gió Lạc chase bỏ chạy hoặc trả đom đóm đã cướp khi đang flee; không trừ Ngọn Lửa và không bị vùng an toàn/bất tử chặn.
| Bùa Gió | Đêm 2 có C1 tại `(35,0,0)`; Đêm 3 có C1/C2 tại tọa độ chuẩn; nhặt theo luật đom đóm; hiệu lực 600 tick, nhặt lại làm mới; chạy 7.2 m/s và lướt không hồi chiêu; bùa hồi sau 2700 tick.
| Chuỗi ba Đêm | Menu → lời dẫn Đêm → chơi → kết quả → Đêm tiếp theo; thắng Đêm 3 mở màn Bình Minh với tổng điểm; thua có thể chơi lại chính Đêm đó.
| Tạm dừng | Esc/P mở hoặc tiếp tục; `tick` tăng nhưng `sim_tick`, thời gian, hồi chiêu, sinh vật và TTL đứng yên; snapshot ghi `state: "paused"`; có Tiếp tục, Chơi lại Đêm, Cài đặt, Về menu.
| Cài đặt | Âm lượng và độ nhạy chuột có thể chỉnh và được lưu qua lần mở game bằng local storage.
| Âm thanh | Nhạc nền và hiệu ứng riêng cho nhặt, thắp đèn, Tỏa Sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, và đếm ngược 10 giây cuối; âm được tổng hợp bằng Web Audio, không dùng asset bên ngoài.
| HUD | Ngọn Lửa trên trái; đồng hồ giữa, đỏ/nhấp nháy khi ≤30 giây; số đèn và điểm trên phải; 10 ô đom đóm dưới giữa; hồi chiêu lướt/Tỏa Sáng dưới phải; lời nhắc E trong tầm; mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình.
| Bảng màu | Màu các thành phần quy định trong Ticket-02 nằm trong sai lệch tối đa 10% mỗi kênh RGB.
| Ánh sáng môi trường | Cường độ môi trường bằng `0.15 + 0.55 × (đèn sáng / tổng đèn)`.

## Test Contract v1.1

- CLI nhận `--night 1`, `--night 2` hoặc `--night 3`.
- Snapshot giữ `tick`, `sim_tick`, trạng thái, điểm, player, đèn và Bóng Mực; bổ sung `night`, `wind {active, dir_deg}`, vận tốc/grounded/invulnerability/cooldown/bùa của player, cùng các mảng `motes`, `drifters`, `charms`.
- Scenario nhận các bộ đếm player mới, trạng thái Bóng Mực, mảng thay thế `drifters`/`charms`, `random_drifters` và `wind_enabled`.
- Input `dash` và `pause` kích hoạt theo cạnh false→true.
- Event mới: `dash {}`, `charm_picked {charm_id, charm_ticks}`, `drifter_steal {drifter_id, amount, carried}`, `drifter_drop {drifter_id, amount}`, `night_start {night}`, `paused {}`, `resumed {}`; rơi khỏi đảo bổ sung `lost` vào `player_hit`.
- Tên trạng thái Bóng Mực: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Một Đêm đủ 21.600 tick phải chạy headless trong không quá 30 giây.

## Kiểm chứng trong repo

- `npm.cmd test`: 23 test đạt, gồm unit/regression và CLI headless với fixture Phase 2.
- `npm.cmd run build`: TypeScript strict và production build thành công; bundle JS 528.62 kB có cảnh báo Vite vượt ngưỡng 500 kB.
- Headless thắng: `tests/fixtures/win-scenario.json` + `tests/fixtures/win-inputs.json`.
- Scenario riêng cho lướt/tạm dừng, Gió Lạc, Bùa Gió, rơi, gió và ba bản đồ: `tests/fixtures/phase2-*`.
- Đêm 3 đủ 21.600 tick chạy trong **0,354 giây** trên môi trường Windows hiện tại (seed 42; sinh đom đóm, Bóng Mực và Gió Lạc bật; gió môi trường tắt; bất tử giữ Mây trong toàn lượt). Kết thúc đúng tick 21.600 khi hết giờ; JSONL: [phase-2-night3-full.jsonl](proof/phase-2-night3-full.jsonl).
- Browser smoke test trên production build: menu, cài đặt, HUD gameplay và tạm dừng hoạt động. Ở viewport 1280×720, một mẫu `requestAnimationFrame` 10 giây đạt **69,9 FPS trung bình**; canvas 1279×719.

## Giả định triển khai

- 20 đom đóm đầu được chọn bằng seed, không lặp điểm; các điểm còn lại là nguồn tái sinh.
- Đêm 3 bắt đầu tại `(0,6,5)` để Mây đứng trên tầng cao và ngoài thể tích tháp chuông; Ticket-02 không ấn định điểm bắt đầu cho Đêm 2–3.
- Âm thanh là nhạc/hiệu ứng tổng hợp tại runtime, tránh asset ngoài và vấn đề giấy phép.
