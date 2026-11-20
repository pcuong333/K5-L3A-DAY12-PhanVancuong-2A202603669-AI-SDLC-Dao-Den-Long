# Phase 3 — Ticket-03 “Đèn cạn dầu”

## Mục tiêu

Test Contract v1.2 thay mục tiêu “thắp hết đèn” bằng “giữ đủ đèn sáng tới bình minh”. Luật được xử lý trong `src/sim`; trình duyệt và CLI headless dùng chung simulation.

## Nhiên liệu và Bóng Mực

- Đèn mới hoặc được thắp lại bắt đầu ở 100 fuel. Khi sáng, đèn tự hao 1 fuel/giây; 60 tick tương đương một giây.
- Tương tác chọn đèn chưa sáng hoặc đèn sáng chưa đầy, gần nhất theo khoảng cách 3D, hòa thì ID nhỏ hơn. Châm dầu dùng `min(đang mang, ceil((100 - fuel) / 10))` đom đóm, mỗi đom đóm thêm tối đa 10 fuel. Đèn đầy không được chọn và không tiêu tài nguyên.
- Đèn hết dầu tắt, `deposited` về 0, phát `lantern_out`, nhưng giữ `ever_lit`. Thắp lại tốn 5 đom đóm thay vì 10.
- Đèn có `fuel < 30` không còn là vùng an toàn; đúng 30 vẫn an toàn. Shade ở `wander` ưu tiên đèn sáng yếu gần nhất, nếu không có thì hướng tới đèn tắt. Shade `chase` giữ hành vi cũ và không đổi mục tiêu theo đèn.
- Shade trong 2 m XZ chuyển sang `drain`, đứng yên và hút 5 fuel/giây; đèn vẫn tự hao thêm 1/giây. Nhiều Shade cộng dồn. Khi Mây vào trong 6 m, Shade chuyển `chase`; bị Tỏa Sáng chuyển `stunned`; đèn tắt, được châm lên ít nhất 30, hoặc Shade đi cách đèn hơn 2 m thì chuyển `wander`.
- Châm đèn qua ngưỡng 30 đẩy các Shade trong bán kính 6 m trong tối đa 30 tick; chúng không gây sát thương trong lúc bị đẩy.

Fuel được lưu bằng số nguyên theo đơn vị 1/60 fuel; chỉ làm tròn khi xuất snapshot/event. Mô hình trạng thái và lựa chọn luật thắng được ghi ở [ADR 003](adr/003-lantern-fuel-and-dawn.md).

## Bình minh, sức chứa và điểm

| Đêm | Thời lượng | Đèn tối thiểu còn sáng |
|---|---:|---:|
| 1 | 240 giây | 3 / 5 |
| 2 | 270 giây | 4 / 6 |
| 3 | 300 giây | 5 / 7 |

Thắp đủ đèn không kết thúc Đêm. Ở tick cuối, Mây phải còn Ngọn Lửa và số đèn sáng phải đạt `ceil(0.6 × tổng đèn)`. Hết Ngọn Lửa luôn thua `no_flames`; không đủ đèn sáng khi hết giờ thua `dawn`; thắng ghi `dawn_survived`.

Sức chứa là `min(20, 10 + 2 × successful_lights)`. Đếm mỗi lần thắp mới hoặc thắp lại thành công trong Đêm; đèn được đặt sẵn bằng scenario không tính. Bộ đếm đặt lại đầu mỗi Đêm.

| Sự kiện | Điểm |
|---|---:|
| Mỗi đom đóm dùng để thắp, thắp lại hoặc châm dầu | +5 |
| Thắp lần đầu | +100 |
| Thắp lại | +40 |
| Mỗi Shade trúng Tỏa Sáng | +5; +15 nếu đang `drain` trước pulse |
| Mỗi đèn còn sáng khi thắng bình minh | +50 + `floor(fuel)` |
| Mỗi Ngọn Lửa còn lại khi thắng bình minh | +50 |
| Thưởng thời gian | Không có |

## Hiển thị và accessibility

- HUD hiển thị số đom đóm đang mang trên sức chứa hiện tại.
- Đèn sáng có thanh dầu; dưới 30 fuel, lửa và thanh dầu nhấp nháy ở chu kỳ 1 Hz. Đèn tắt xẹp 20% và có vết rách trên giấy.
- Cài đặt “Bảng màu dễ phân biệt” được lưu qua local storage. Viền/mắt Shade đổi từ `#7A3CFF` sang `#00B3FF`; cảnh báo đổi từ `#FF5A5F` sang trắng và có biểu tượng ⚠. Đèn tắt/sáng vẫn phân biệt được bằng hình dạng.

## Test Contract v1.2

- Tuning mới: `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`; thời lượng Đêm 1–3 là 240/270/300 giây.
- Snapshot thêm `fuel` (một chữ số thập phân, đèn tắt là 0), `ever_lit`, `relit_count` trên mỗi đèn và `capacity` trên player. Shade hỗ trợ trạng thái `drain`.
- Scenario thêm `lit`, `fuel`, `ever_lit` trên đèn; `successful_lights` trên player; `target_lantern_id` trên Shade. Đèn đặt `lit: true` mà bỏ `fuel` mặc định có 100.
- Event mới: `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}` mỗi 60 tick đang hút. `lantern_lit` thêm `relight`; `game_over.reason` dùng `dawn_survived`, `dawn`, hoặc `no_flames` (không còn `all_lit`).

## Kiểm chứng

- `npm.cmd test`: 36 test đạt, gồm regression Phase 1–2, simulation Phase 3 và CLI headless.
- `npm.cmd run build`: TypeScript strict và production build thành công; bundle JS 533.89 kB (gzip 138.61 kB), Vite vẫn cảnh báo vượt ngưỡng 500 kB.
- Scenario thắng bình minh và scenario input không hợp lệ được kiểm tra trong `tests/phase3-headless.test.ts`.
- Night 3 đủ 18.000 tick (5 phút) chạy trong **3.417 giây** trên môi trường Windows hiện tại, gồm thời gian khởi động CLI; JSONL: [phase-3-night3-full.jsonl](proof/phase-3-night3-full.jsonl).
- Browser smoke trên Vite dev server: menu → cài đặt → reload vẫn giữ lựa chọn bảng màu → intro → HUD; đã xác nhận màn hình tạm dừng. Không ghi nhận lỗi khởi động WebGL.
