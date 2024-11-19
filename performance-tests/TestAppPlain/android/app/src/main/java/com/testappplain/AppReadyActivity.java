package com.testappplain;

import android.os.Bundle;
import android.os.Handler;
import androidx.appcompat.app.AppCompatActivity;

public class AppReadyActivity extends AppCompatActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    setContentView(android.R.layout.simple_list_item_1); // An empty view

    // Close the activity after 1 second
    new Handler()
        .postDelayed(
            new Runnable() {
              @Override
              public void run() {
                finish();
              }
            },
            1000);
  }
}
