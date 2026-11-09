package com.mrhumildad.riotsradios;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.widget.ImageView;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import com.mrhumildad.riotsradios.spectrum.RiotsPlaybackPlugin;

public class MainActivity extends BridgeActivity {

    /* The launch theme was dropped the instant the activity drew, so the splash
       flashed past in a frame and read as a glitch. Hold it for a beat. */
    private static final long SPLASH_HOLD_MS = 3_000;
    private static final long SPLASH_FADE_MS = 200;

    private final long splashShownAt = SystemClock.elapsedRealtime();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate(): the condition is installed on the
        // splash window created by the launch theme (AppTheme.NoActionBarLaunch).
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(
            () -> SystemClock.elapsedRealtime() - splashShownAt < SPLASH_HOLD_MS
        );

        // Local (in-app) plugins must be registered before the bridge starts.
        registerPlugin(RiotsPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
        applyOrientationLock();
        applySystemBars();
        // Capacitor's built-in SystemBars plugin applies its own config once the
        // bridge has started (it shows the system bars again), so re-assert the
        // mode on the next turn of the main thread and let ours win.
        getWindow().getDecorView().post(this::applySystemBars);

        /* core-splashscreen only holds the window from API 31. Below that the
           launch theme is dropped as soon as the activity draws, so the same
           hold is enforced with an overlay carrying the same art — no new
           dependency, no second code path in the theme. */
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && savedInstanceState == null) {
            showLegacySplash();
        }
    }

    /* A phone holds portrait: the chassis is a one-hand dashboard and rotating
       it only squeezes the channel list into a couple of rows. Tablets and the
       TV build keep free orientation — theirs is the wide layout, and a
       manifest-level portrait lock would disqualify the TV submission. */
    private void applyOrientationLock() {
        boolean tv = getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
        boolean tablet = getResources().getConfiguration().smallestScreenWidthDp >= 600;
        setRequestedOrientation(
            tv || tablet
                ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        );
    }

    /* The chassis is dark and full-bleed: the status bar stays visible in the
       app's own black, while the Android navigation bar is hidden in immersive
       "sticky" mode — a swipe up from the bottom edge reveals it, then it
       slides away again instead of sitting there. Sticky matters: plain hide()
       would make the first swipe bring the bar back for good. */
    private void applySystemBars() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.navigationBars());
    }

    /* Dialogs, the keyboard and returning from another app all re-show the
       navigation bar, so re-apply the mode whenever the window regains focus. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBars();
        }
    }

    /** Pre-API 31 splash: the launch bitmap, held for the rest of the beat. */
    private void showLegacySplash() {
        ImageView overlay = new ImageView(this);
        overlay.setImageResource(R.drawable.splash);
        overlay.setScaleType(ImageView.ScaleType.CENTER_CROP);
        overlay.setBackgroundColor(Color.BLACK);
        overlay.setClickable(true); // taps land on the splash, not the player
        addContentView(
            overlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        long remaining = SPLASH_HOLD_MS - (SystemClock.elapsedRealtime() - splashShownAt);
        overlay.postDelayed(
            () ->
                overlay
                    .animate()
                    .alpha(0f)
                    .setDuration(SPLASH_FADE_MS)
                    .withEndAction(
                        () -> {
                            ViewGroup parent = (ViewGroup) overlay.getParent();
                            if (parent != null) {
                                parent.removeView(overlay);
                            }
                        }
                    )
                    .start(),
            Math.max(0, remaining)
        );
    }
}
