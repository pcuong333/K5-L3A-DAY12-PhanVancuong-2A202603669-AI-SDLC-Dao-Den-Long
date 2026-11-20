# Phase 1 — giả định và kiểm chứng

## Giả định gameplay

- Đảo có bán kính 30 m; người chơi không thể đi khỏi mép đảo, nên `fall_enabled` là `false`.
- Mây bắt đầu với 3 đơn vị ánh sáng. Một cú chạm của Bóng Mực làm mất 1 đơn vị; pulse tiêu hao 1 đơn vị.
- Mỗi Đèn Lồng Lớn cần 5 đom đóm; Mây mang tối đa 5. Đom đóm được tính điểm khi nhặt.
- Pulse làm choáng Bóng Mực trong 2 giây, đẩy lùi 3 m, bán kính 5 m và hồi chiêu 2 giây.
- Bóng Mực không đi vào bán kính 5 m quanh đèn đã thắp. Màn chơi kéo dài 300 giây.
- Các mức điểm và các giá trị mô phỏng chính thức nằm trong `game.contract.json`; khi chỉnh tuning cần cập nhật đồng bộ `src/sim/config.ts`.

## Tiêu chí nghiệm thu

| Yêu cầu | Cách kiểm tra |
|---|---|
| Di chuyển, nhảy, camera 3D | Chơi trực tiếp trong trình duyệt |
| Nhặt đom đóm trong bán kính và giới hạn sức chứa | Unit test mô phỏng |
| Nạp đom đóm, thắp đủ đèn, thắng | Unit test scenario |
| Bóng Mực đuổi, gây sát thương; pulse làm choáng/đẩy lùi | Unit test mô phỏng và chơi trực tiếp |
| Headless theo tick cố định, có snapshot/event/end JSONL | Chạy CLI với seed/scenario/inputs |
| Cùng seed và đầu vào cho output giống hệt | Chạy lại CLI và so sánh byte-for-byte |

## Bằng chứng

Chỉ ghi kết quả sau khi lệnh kiểm chứng thật sự chạy. Không dùng output sửa tay làm bằng chứng.

- `npm test`: 5/5 test đạt.
- `npm run build`: TypeScript và Vite build production đạt.
- Headless thắng: `tests/fixtures/win-scenario.json` + `tests/fixtures/win-inputs.json`; output thực tế ở `docs/proof/phase-1-win.jsonl` (thắng tại tick 1).
- Headless đứng yên đúng 60 bước: `docs/proof/phase-1-fixed-tick.jsonl` cho thấy tick 60, còn 299 giây.
- Ảnh [phase-1-gameplay.png](proof/phase-1-gameplay.png) ghi lại cảnh game 3D đang chạy với HUD, Mây, Bóng Mực và 1 đom đóm đã nhặt (10 điểm). Ảnh là bằng chứng trạng thái chơi, không tự nó chứng minh toàn bộ điều khiển hay luồng thắng.
- Video gameplay [demo.mp4](demo/demo.mp4) (0:47) do người dùng cung cấp và được lưu nguyên bản; README liên kết video ở đầu.
- Chạy scenario headless hai lần với seed `42`: SHA-256 giống nhau (`E8290098D9160FC6840FBCB68DFFE9B92E0DC910352AA1A1532C0CF446AAEC34`).
- Inputs có tick lặp trả exit code `2`, như Test Contract yêu cầu.
