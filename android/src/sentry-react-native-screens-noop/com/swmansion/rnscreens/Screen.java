package com.swmansion.rnscreens;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import androidx.annotation.Nullable;

public class Screen extends View {
  public Screen(Context context) {
    super(context);
  }

  public Screen(Context context, @Nullable AttributeSet attrs) {
    super(context, attrs);
  }

  public Screen(Context context, @Nullable AttributeSet attrs, int defStyleAttr) {
    super(context, attrs, defStyleAttr);
  }

  public Screen(Context context, @Nullable AttributeSet attrs, int defStyleAttr, int defStyleRes) {
    super(context, attrs, defStyleAttr, defStyleRes);
  }

  public int getId() {
    return -1;
  }
}
