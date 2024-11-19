package com.testappplain;

import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup.LayoutParams;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class AppReadyActivity extends AppCompatActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Add a simple text saying that the app is fully loaded
    LinearLayout layout = new LinearLayout(this);
    layout.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    layout.setGravity(Gravity.CENTER);
    TextView textView = new TextView(this);
    textView.setText("The App is fully loaded!\nTap/swipe back to close this view.");
    textView.setTextSize(24);
    textView.setGravity(Gravity.CENTER);
    layout.addView(textView);
    setContentView(layout);
  }
}
