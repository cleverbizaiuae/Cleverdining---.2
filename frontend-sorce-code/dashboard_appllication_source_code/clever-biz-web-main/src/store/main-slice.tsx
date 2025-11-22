import { createSlice } from "@reduxjs/toolkit";

const mainSlice = createSlice({
  name: "main",
  initialState: {},
  reducers: {},
});

// eslint-disable-next-line no-empty-pattern
export const {} = mainSlice.actions;

export default mainSlice.reducer;
