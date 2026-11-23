package com.dabali.game;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ImageView fullSplashView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Intercept Android 12 splash screen and remove it immediately
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setOnExitAnimationListener(new SplashScreen.OnExitAnimationListener() {
            @Override
            public void onSplashScreenExit(SplashScreenViewProvider provider) {
                provider.remove();
            }
        });

        super.onCreate(savedInstanceState);

        // Display the full-screen Chef background artwork edge-to-edge (no circle)
        fullSplashView = new ImageView(this);
        fullSplashView.setImageResource(R.drawable.splash);
        fullSplashView.setScaleType(ImageView.ScaleType.CENTER_CROP);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        addContentView(fullSplashView, params);

        // Keep the Chef full-screen poster visible for 2 seconds (Écran 1),
        // then smoothly fade out to reveal the cinematic video & JOUER button (Écran 2)
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (fullSplashView != null) {
                    fullSplashView.animate()
                        .alpha(0f)
                        .setDuration(400)
                        .withEndAction(new Runnable() {
                            @Override
                            public void run() {
                                if (fullSplashView != null && fullSplashView.getParent() != null) {
                                    ((ViewGroup) fullSplashView.getParent()).removeView(fullSplashView);
                                    fullSplashView = null;
                                }
                            }
                        })
                        .start();
                }
            }
        }, 2000);
    }
}

