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

    // Create a LinearLayout to hold the TextView
    LinearLayout layout = new LinearLayout(this);
    layout.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    layout.setGravity(Gravity.CENTER);

    // Create a TextView with the text "App Ready"
    TextView textView = new TextView(this);
    textView.setText("The App is fully loaded!\nTap/swipe back to close this view.");
    textView.setTextSize(24); // Set text size
    textView.setGravity(Gravity.CENTER);

    // Add the TextView to the LinearLayout
    layout.addView(textView);

    // Set the LinearLayout as the content view
    setContentView(layout);
  }
}
