package md.solomud.radio;

import android.app.Activity;
import android.content.ComponentName;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.media3.session.SessionCommand;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Arrays;
import java.util.HashSet;
import java.util.ArrayList;
import org.json.JSONObject;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

public class MainActivity extends Activity {
    private static final String HOME = "https://solomudradio.pages.dev/";
    private WebView webView;
    private MediaController controller;
    private ListenableFuture<MediaController> controllerFuture;
    private final ArrayList<JSONObject> pendingCommands = new ArrayList<>();
    private FrameLayout root;
    private View fullScreenView;
    private WebChromeClient.CustomViewCallback fullScreenCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 27, 26));
        getWindow().setNavigationBarColor(Color.rgb(7, 27, 26));
        root = new FrameLayout(this);
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.setBackgroundColor(Color.rgb(7, 27, 26));
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) {
                    if ("https".equalsIgnoreCase(uri.getScheme()) && "solomudradio.pages.dev".equalsIgnoreCase(host)) return false;
                    if ("https".equalsIgnoreCase(uri.getScheme()) && "solomud-hue.github.io".equalsIgnoreCase(host)
                            && uri.getPath() != null
                            && uri.getPath().startsWith("/solomud-radio")) return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {}
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullScreenView = view;
                fullScreenCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
            }
            @Override
            public void onHideCustomView() {
                closeFullScreen();
            }
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "SolomudNative", new HashSet<>(Arrays.asList(
                    "https://solomudradio.pages.dev", "https://solomud-hue.github.io")),
                    (view, message, origin, mainFrame, reply) -> {
                        if (!mainFrame || !trustedPage(view.getUrl())) return;
                        try {
                            JSONObject command = new JSONObject(message.getData());
                            if (controller == null) pendingCommands.add(command);
                            else handleCommand(command);
                        } catch (Exception ignored) {}
                    });
            controllerFuture = new MediaController.Builder(this,
                    new SessionToken(this, new ComponentName(this, RadioPlaybackService.class))).buildAsync();
            controllerFuture.addListener(() -> {
                try {
                    controller = controllerFuture.get();
                    controller.addListener(new Player.Listener() {
                        @Override public void onEvents(Player player, Player.Events events) { sendState(); }
                    });
                    for (JSONObject command : pendingCommands) handleCommand(command);
                    pendingCommands.clear();
                    sendState();
                } catch (Exception error) {
                    if (webView != null) webView.evaluateJavascript(
                            "window.onNativeRadioState && window.onNativeRadioState({state:'failed'})", null);
                }
            }, runnable -> runOnUiThread(runnable));
        }
        webView.loadUrl(HOME);
    }

    private boolean trustedPage(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && ("solomudradio.pages.dev".equals(uri.getHost())
                || ("solomud-hue.github.io".equals(uri.getHost()) && uri.getPath() != null
                    && uri.getPath().startsWith("/solomud-radio/")));
    }

    private void handleCommand(JSONObject command) {
        try {
            switch (command.getString("type")) {
                case "play": {
                    String url = command.getString("url");
                    // Match the website's HTTPS-only transport policy.
                    if (!"https".equalsIgnoreCase(Uri.parse(url).getScheme())) {
                        webView.evaluateJavascript("window.onNativeRadioState && window.onNativeRadioState({state:'failed'})", null);
                        return;
                    }
                    Bundle extras = new Bundle();
                    extras.putString("station", command.getJSONObject("station").toString());
                    MediaItem item = new MediaItem.Builder().setUri(url)
                            .setMediaId(command.getString("request"))
                            .setMediaMetadata(new MediaMetadata.Builder()
                                    .setTitle(command.getJSONObject("station").optString("name", "Solomud Radio"))
                                    .setArtist("Solomud Radio").setExtras(extras).build()).build();
                    controller.setMediaItem(item);
                    controller.setVolume((float)command.optDouble("volume", 0.8));
                    controller.prepare();
                    controller.play();
                    break;
                }
                case "pause": controller.pause(); break;
                case "volume": controller.setVolume((float)Math.max(0, Math.min(1, command.optDouble("value", 0.8)))); break;
                case "sleep": {
                    Bundle args = new Bundle(); args.putInt("minutes", command.optInt("minutes"));
                    controller.sendCustomCommand(new SessionCommand(RadioPlaybackService.SLEEP, Bundle.EMPTY), args);
                    break;
                }
                case "state": sendState(); break;
                default: break;
            }
        } catch (Exception ignored) {}
    }

    private void sendState() {
        if (webView == null || controller == null || !trustedPage(webView.getUrl())) return;
        MediaItem item = controller.getCurrentMediaItem();
        if (item == null) return;
        try {
            String state = controller.isPlaying() ? "playing" : !controller.getPlayWhenReady()
                    ? (controller.getPlayerError() == null ? "paused" : "failed") : "buffering";
            JSONObject data = new JSONObject().put("state", state).put("request", item.mediaId);
            if (item.mediaMetadata.extras != null)
                data.put("station", new JSONObject(item.mediaMetadata.extras.getString("station", "{}")));
            webView.evaluateJavascript("window.onNativeRadioState && window.onNativeRadioState(" + data + ")", null);
        } catch (Exception ignored) {}
    }

    @Override protected void onResume() {
        super.onResume();
        sendState();
    }

    private void closeFullScreen() {
        if (fullScreenView == null) return;
        root.removeView(fullScreenView);
        fullScreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullScreenCallback != null) {
            fullScreenCallback.onCustomViewHidden();
            fullScreenCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (fullScreenView != null) {
            closeFullScreen();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (controllerFuture != null) MediaController.releaseFuture(controllerFuture);
        controller = null;
        pendingCommands.clear();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
