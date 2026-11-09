# SoloMud Radio для iPhone

Проект Xcode для iOS 16 и новее. Приложение открывает [SoloMud Radio](https://solomudradio.pages.dev/) внутри iOS-приложения. Оно использует тот же каталог станций, избранное и ретро-плеер, что сайт. Для эфира нужен интернет.

## Запуск на iPhone

1. На Mac откройте `SoloMudRadio.xcodeproj` в Xcode.
2. Подключите iPhone и выберите его в списке устройств вверху окна.
3. В настройках цели **SoloMudRadio** откройте **Signing & Capabilities** («Подпись и возможности»). Выберите свою команду Apple в поле **Team**.
4. Нажмите ▶. Xcode соберёт, подпишет и установит приложение на выбранный iPhone.

Для ссылки на установку через TestFlight или App Store нужна подписанная сборка, загруженная в App Store Connect.

## Проверочная сборка для симулятора

```sh
xcodebuild -project SoloMudRadio.xcodeproj -scheme SoloMudRadio \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
