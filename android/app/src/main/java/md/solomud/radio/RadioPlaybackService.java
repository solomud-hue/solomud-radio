package md.solomud.radio;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionResult;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

/** Owns audio independently of the WebView, Activity and JavaScript timers. */
public final class RadioPlaybackService extends MediaSessionService {
    static final String SLEEP = "md.solomud.radio.SLEEP";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private MediaSession session;
    private PowerManager.WakeLock retryLock;
    private int retries;
    private static final long BUFFER_TIMEOUT_MS = 30000L;
    private final Runnable bufferingTimeout = () -> {
        if (player.getPlayWhenReady() && player.getPlaybackState() == Player.STATE_BUFFERING
                && player.getPlaybackSuppressionReason() == Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
            Log.w("SolomudPlayback", "Buffer stalled; reconnecting the live stream");
            scheduleRetry();
        }
    };
    private final Runnable sleep = () -> player.pause();
    private final Runnable retry = () -> {
        if (player.getPlayWhenReady()) {
            // Stop the old loader too: prepare alone cannot unstick BUFFERING.
            player.stop();
            player.seekToDefaultPosition();
            player.prepare();
        } else cancelRetry();
    };

    @Override public void onCreate() {
        super.onCreate();
        retryLock = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "SolomudRadio:reconnect");
        retryLock.setReferenceCounted(false);
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) {
                Log.w("SolomudPlayback", "Stream error: " + error.getErrorCodeName(), error);
                scheduleRetry();
            }
            @Override public void onPlaybackStateChanged(int state) {
                handler.removeCallbacks(bufferingTimeout);
                if (state == Player.STATE_BUFFERING && player.getPlayWhenReady())
                    handler.postDelayed(bufferingTimeout, BUFFER_TIMEOUT_MS);
                if (state == Player.STATE_READY) { retries = 0; cancelRetry(); }
                if (state == Player.STATE_ENDED && player.getPlayWhenReady()) scheduleRetry();
            }
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                Log.i("SolomudPlayback", "playWhenReady=" + ready + " reason=" + reason);
                handler.removeCallbacks(bufferingTimeout);
                if (!ready) cancelRetry();
                else if (player.getPlaybackState() == Player.STATE_BUFFERING)
                    handler.postDelayed(bufferingTimeout, BUFFER_TIMEOUT_MS);
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                retries = 0; cancelRetry();
            }
        });
        PendingIntent activity = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(activity)
                .setCallback(new MediaSession.Callback() {
                    @Override public MediaSession.ConnectionResult onConnect(MediaSession s, MediaSession.ControllerInfo controller) {
                        MediaSession.ConnectionResult result = MediaSession.Callback.super.onConnect(s, controller);
                        if (!getPackageName().equals(controller.getPackageName())) return result;
                        return new MediaSession.ConnectionResult.AcceptedResultBuilder(s)
                                .setAvailableSessionCommands(result.availableSessionCommands.buildUpon()
                                        .add(new SessionCommand(SLEEP, Bundle.EMPTY)).build()).build();
                    }
                    @Override public ListenableFuture<SessionResult> onCustomCommand(MediaSession s,
                            MediaSession.ControllerInfo controller, SessionCommand command, Bundle args) {
                        if (!SLEEP.equals(command.customAction)) return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED));
                        handler.removeCallbacks(sleep);
                        int minutes = Math.max(0, Math.min(60, args.getInt("minutes")));
                        if (minutes > 0) handler.postDelayed(sleep, minutes * 60000L);
                        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
                    }
                }).build();
    }

    private void scheduleRetry() {
        cancelRetry();
        if (!player.getPlayWhenReady()) return;
        // A network failure must not become a user pause after eight attempts.
        // Keep a capped backoff; explicit Pause, audio-focus loss and the sleep
        // timer still cancel pending work through onPlayWhenReadyChanged.
        retries = Math.min(retries + 1, 5);
        handler.removeCallbacks(bufferingTimeout);
        // Keep the CPU available during a short reconnect even if the screen is off.
        retryLock.acquire(60000);
        handler.postDelayed(retry, Math.min(30000L, 1000L << Math.min(retries, 5)));
    }
    private void cancelRetry() {
        handler.removeCallbacks(retry);
        if (retryLock.isHeld()) retryLock.release();
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) { return session; }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        cancelRetry();
        session.release();
        player.release();
        super.onDestroy();
    }
}
