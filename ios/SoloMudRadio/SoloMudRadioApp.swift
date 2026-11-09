import SwiftUI
import UIKit
import WebKit

@main
struct SoloMudRadioApp: App {
    var body: some Scene {
        WindowGroup {
            RadioScreen()
        }
    }
}

private struct RadioScreen: View {
    @StateObject private var browser = RadioBrowser()

    var body: some View {
        ZStack {
            Color(red: 7 / 255, green: 27 / 255, blue: 26 / 255)
                .ignoresSafeArea()

            RadioWebView(webView: browser.webView)
                .accessibilityHidden(browser.state != .ready)

            switch browser.state {
            case .loading:
                ProgressView("Загружаем SoloMud Radio…")
                    .padding(24)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            case .ready:
                EmptyView()
            case .failed:
                VStack(spacing: 16) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 34))
                        .accessibilityHidden(true)
                    Text("Радио временно недоступно")
                        .font(.headline)
                    Text("Проверь подключение к интернету и попробуй ещё раз.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Повторить", action: browser.load)
                        .buttonStyle(.borderedProminent)
                }
                .padding(24)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                .padding(24)
            }
        }
        .preferredColorScheme(.dark)
        .task { browser.start() }
    }
}

private struct RadioWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

@MainActor
private final class RadioBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    enum State {
        case loading
        case ready
        case failed
    }

    private static let home = URL(string: "https://solomudradio.pages.dev/")!
    @Published private(set) var state = State.loading
    let webView: WKWebView
    private var hasStarted = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = UIColor(red: 7 / 255, green: 27 / 255, blue: 26 / 255, alpha: 1)
    }

    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        load()
    }

    func load() {
        state = .loading
        webView.load(URLRequest(url: Self.home, timeoutInterval: 30))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        state = .ready
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure(for: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure(for: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        state = .failed
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if response.isForMainFrame,
           let http = response.response as? HTTPURLResponse,
           http.statusCode >= 400 {
            state = .failed
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if action.targetFrame?.isMainFrame == false || isRadioURL(url) {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        if action.navigationType == .linkActivated {
            openExternal(url)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if isRadioURL(url) {
            webView.load(action.request)
        } else if action.navigationType == .linkActivated {
            openExternal(url)
        }
        return nil
    }

    private func isRadioURL(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == Self.home.host
    }

    private func openExternal(_ url: URL) {
        guard let scheme = url.scheme,
              ["https", "http", "viber", "whatsapp", "tg"].contains(scheme) else { return }
        UIApplication.shared.open(url)
    }

    private func showFailure(for error: Error) {
        let failure = error as NSError
        guard failure.domain != NSURLErrorDomain || failure.code != NSURLErrorCancelled else { return }
        state = .failed
    }
}
