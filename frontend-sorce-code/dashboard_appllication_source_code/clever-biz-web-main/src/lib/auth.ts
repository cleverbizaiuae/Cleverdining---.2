export const getAccessToken = () => localStorage.getItem("accessToken");
export const getUserInfo = () => JSON.parse(localStorage.getItem("userInfo") || "{}");
