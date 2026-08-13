/**
* 將資料庫傳回的 UTC 時間字串格式化為香港本地時間
*/
export const formatDateTime = (dateString) => {
    if (!dateString) return null;

    let formattedString = dateString;

    // 若結尾缺少 Z 則自動補上，確保 JavaScript 識別為 UTC 並自動加 8 小時
    if (typeof dateString === 'string' && !dateString.endsWith('Z')) {
        formattedString = dateString + 'Z';
    }
    return new Date(formattedString).toLocaleString('zh-HK');
};