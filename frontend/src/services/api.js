// src/services/api.js
import { API_BASE } from '../utils/constants';
import { WS_BASE } from '../utils/constants';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.clearToken();
          window.location.href = '/login';
        }
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // Auth methods
  async login(apiKey) {
    const data = await this.request(`/api/auth/token?api_key=${apiKey}`, {
      method: 'POST',
      skipAuth: true,
    });
    this.setToken(data.access_token);
    return data;
  }

  // Application methods
  async getApplications() {
    return this.request('/api/admin/applications');
  }

  async createApplication(appData) {
    return this.request('/api/admin/applications', {
      method: 'POST',
      body: JSON.stringify(appData),
    });
  }

  async updateApplication(appId, appData) {
    return this.request(`/api/admin/applications/${appId}`, {
      method: 'PUT',
      body: JSON.stringify(appData),
    });
  }

  async deleteApplication(appId, permanent = false) {
    return this.request(`/api/admin/applications/${appId}?permanent=${permanent}`, {
      method: 'DELETE',
    });
  }

  // Branch methods
  async getBranches(applicationId = null) {
    let query = '/api/admin/branches';
    if (applicationId) {
      query += `?application_id=${applicationId}`;
    }
    return this.request(query);
  }

  async createBranch(branchData) {
    return this.request('/api/admin/branches', {
      method: 'POST',
      body: JSON.stringify(branchData),
    });
  }

  async updateBranch(branchId, branchData) {
    return this.request(`/api/admin/branches/${branchId}`, {
      method: 'PUT',
      body: JSON.stringify(branchData),
    });
  }

  async deleteBranch(branchId, permanent = false) {
    return this.request(`/api/admin/branches/${branchId}?permanent=${permanent}`, {
      method: 'DELETE',
    });
  }

  // Version methods
  async getVersions(applicationId = null, branchId = null) {
    let query = '/api/admin/versions';
    const params = new URLSearchParams();
    
    if (applicationId) params.append('application_id', applicationId);
    if (branchId) params.append('branch_id', branchId);
    
    if (params.toString()) {
      query += `?${params.toString()}`;
    }
    
    return this.request(query);
  }

  async uploadAPK(formData) {
    try {
      // 將所有參數都放在查詢字符串中
      const queryParams = new URLSearchParams();
      
      // 必要參數
      queryParams.append('application_id', formData.get('application_id'));
      queryParams.append('branch_id', formData.get('branch_id'));
      queryParams.append('version_code', formData.get('version_code'));
      queryParams.append('version_name', formData.get('version_name'));
      
      // 額外參數也放在查詢字符串中
      const forceUpdate = formData.get('force_update');
      queryParams.append('force_update', forceUpdate === 'true' || forceUpdate === true ? 'true' : 'false');
      
      const minVersion = formData.get('min_supported_version') || '0';
      queryParams.append('min_supported_version', minVersion);
      
      const releaseNotes = formData.get('release_notes') || '';
      queryParams.append('release_notes', releaseNotes);

      // 只有檔案在 FormData 中
      const uploadFormData = new FormData();
      uploadFormData.append('file', formData.get('file'));

      console.log('Full query string:', queryParams.toString());

      const response = await fetch(`${API_BASE}/api/admin/upload-apk?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = `Upload failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch (e) {
          // 無法解析錯誤響應
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  async get(endpoint) {
    const headers = {
      'Authorization': `Bearer ${this.token}`,
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.clearToken();
          window.location.href = '/login';
        }
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  async deleteVersion(versionId, permanent = false, deleteFile = false) {
    return this.request(`/api/admin/versions/${versionId}?permanent=${permanent}&delete_file=${deleteFile}`, {
      method: 'DELETE',
    });
  }

  // Update logs
  async getUpdateLogs(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    
    let query = '/api/admin/logs';
    if (params.toString()) {
      query += `?${params.toString()}`;
    }
    
    return this.request(query);
  }

  // V2 Login (Username + Password)
  async loginV2(username, password) {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(`${API_BASE}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    
    if (!response.ok) throw new Error('登入失敗');
    const data = await response.json();
    this.setToken(data.access_token);
    localStorage.setItem('apiMode', 'v2');
    return data;
  }

  // Users Management V2
  async getUsers() { return this.request('/api/v2/admin/users'); }
  async createUser(data) { return this.request('/api/v2/admin/users', { method: 'POST', body: JSON.stringify(data) }); }
  async deleteUser(userId) { return this.request(`/api/v2/admin/users/${userId}`, { method: 'DELETE' }); }

  // Store Management V2
  async getStoreApps() { return this.request('/api/v2/admin/store/apps'); }
  async getStoreAppDetails(appId) { return this.request(`/api/v2/admin/store/apps/${appId}/details`); }

  // Device V2 APIs
  async sendDeviceCommandV2(androidId, payload) {
    return this.request(`/api/v2/admin/devices/${androidId}/command`, {
      method: 'POST', body: JSON.stringify(payload)
    });
  }
  async getDeviceInstalledApps(androidId) {
    return this.request(`/api/v2/admin/devices/${androidId}/installed-apps`);
  }
  async getDeviceLocationHistory(androidId) {
    return this.request(`/api/v2/admin/devices/${androidId}/location-history`);
  }

  // System settings
  async getSystemSettings() {
    return this.request('/api/admin/settings');
  }

  async updateSystemSettings(settings) {
    return this.request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // API Key management
  async getApiKeys() {
    return this.request('/api/admin/api-keys');
  }

  async createApiKey(data) {
    return this.request('/api/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeApiKey(keyId) {
    return this.request(`/api/admin/api-keys/${keyId}/revoke`, {
      method: 'POST',
    });
  }

  // Database management
  async getDatabaseStats() {
    return this.request('/api/admin/database/stats');
  }

  async backupDatabase() {
    return this.request('/api/admin/database/backup', {
      method: 'POST',
    });
  }

  async cleanupDatabase() {
    return this.request('/api/admin/database/cleanup', {
      method: 'POST',
    });
  }

  async createDevice(deviceData) {
    return this.request('/api/admin/devices', {
      method: 'POST',
      body: JSON.stringify(deviceData),
    });
  }

  async getDevices(queryString = '') {
    console.log(queryString);
    return this.request(`/api/admin/devices?${queryString}`);
  }

  async getDeviceDetails(deviceId) {
    return this.request(`/api/admin/devices/${deviceId}?include_logs=true`);
  }

  async updateDevice(deviceId, deviceData) {
    return this.request(`/api/admin/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(deviceData),
    });
  }

  async deleteDevice(deviceId, permanent = false) {
    return this.request(`/api/admin/devices/${deviceId}?permanent=${permanent}`, {
      method: 'DELETE',
    });
  }

  async activateDevice(deviceId) {
    return this.request(`/api/admin/devices/${deviceId}/activate`, {
      method: 'POST',
    });
  }

  async sendDeviceCommand(androidId, commandPayload) {
    return this.request(`/api/v2/admin/devices/${androidId}/command`, {
      method: 'POST',
      body: JSON.stringify(commandPayload),
    });
  }

  async getDeviceStatistics(days = 30) {
    return this.request(`/api/admin/devices/stats/summary?days=${days}`);
  }

  async bulkDeactivateDevices(daysInactive) {
    return this.request(`/api/admin/devices/bulk/deactivate?days_inactive=${daysInactive}`, {
      method: 'POST',
    });
  }

  // Statistics
  async getStatistics(period = 'week') {
    return this.request(`/api/admin/statistics?period=${period}`);
  }

  // Version check
  async checkVersion(data) {
    return this.request('/api/check-version', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Download reporting
  async reportDownload(data) {
    return this.request('/api/report-download', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Device V2 APIs
  async getAllDevicesV2() {
    return this.request('/api/v2/admin/devices');
  }

  // 取得指定裝置的 App Config
  async getDeviceAppConfig(androidId, appId) {
    return this.request(`/api/v2/admin/devices/${androidId}/configs/${appId}`);
  }

  // 更新指定裝置的 App Config
  async updateDeviceAppConfig(androidId, appId, configData) {
    return this.request(`/api/v2/admin/devices/${androidId}/configs/${appId}`, {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  }

  // ==================== 螢幕遠端控制 API ====================
  
  /**
   * 啟動螢幕截取（開始推送畫面）
   * @param {string} androidId - 設備的 Android ID
   * @param {number} quality - JPEG 壓縮品質 (1-100)
   * @param {number} scale - 縮放倍數 (1=原尺寸, 2=50%, 3=33%)
   */
  async startScreenCapture(androidId, quality = 50, scale = 2) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_screen_capture',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `screen_${Date.now()}`,
      quality: quality,
      scale: scale
    });
  }

  /**
   * 停止螢幕截取
   * @param {string} androidId - 設備的 Android ID
   */
  async stopScreenCapture(androidId) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_stop_capture',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `stop_${Date.now()}`
    });
  }

  /**
   * 發送觸控事件（點擊螢幕）
   * @param {string} androidId - 設備的 Android ID
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @param {string} action - 'tap' | 'down' | 'move' | 'up' (預設: tap)
   */
  async sendTouchEvent(androidId, x, y, action = 'tap') {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_touch_event',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `touch_${Date.now()}`,
      x: x,
      y: y,
      touch_action: action
    });
  }

  /**
   * 發送按鍵事件（虛擬按鍵）
   * @param {string} androidId - 設備的 Android ID
   * @param {number} keycode - Android Keycode (3=HOME, 4=BACK, 187=RECENT)
   */
  async sendKeyEvent(androidId, keycode) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_key_event',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `key_${Date.now()}`,
      keycode: keycode
    });
  }

  /**
   * 發送文字輸入（輸入文字到焦點輸入框）
   * @param {string} androidId - 設備的 Android ID
   * @param {string} text - 要輸入的文字
   */
  async sendTextInput(androidId, text) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_input_text',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `input_${Date.now()}`,
      text: text
    });
  }

  /**
   * 發送滑動手勢（swipe）
   * @param {string} androidId - 設備的 Android ID
   * @param {number} startX - 起始 X 座標
   * @param {number} startY - 起始 Y 座標
   * @param {number} endX - 結束 X 座標
   * @param {number} endY - 結束 Y 座標
   * @param {number} duration - 持續時間（毫秒，預設 300ms）
   */
  async sendSwipeGesture(androidId, startX, startY, endX, endY, duration = 300) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_swipe',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `swipe_${Date.now()}`,
      start_x: startX,
      start_y: startY,
      end_x: endX,
      end_y: endY,
      duration: duration
    });
  }

  /**
   * 旋轉螢幕方向
   * @param {string} androidId - 設備的 Android ID
   * @param {number} rotation - 0=正常, 1=90度, 2=180度, 3=270度
   */
  async rotateScreen(androidId, rotation) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_rotate_screen',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `rotate_${Date.now()}`,
      rotation: rotation
    });
  }

  /**
   * 截取單一畫面快照（非即時串流）
   * @param {string} androidId - 設備的 Android ID
   * @returns {Promise<{image_base64: string}>} Base64 編碼的 JPEG 圖片
   */
  async captureScreenshot(androidId) {
    return this.sendDeviceCommandV2(androidId, {
      action: 'DC_screenshot',
      target_app: 'com.kowloondairy.mdmapp',
      task_id: `screenshot_${Date.now()}`
    });
  }

  /**
   * 取得螢幕即時串流的 WebSocket URL
   * @param {string} androidId - 設備的 Android ID
   * @param {string} deviceApiKey - 設備的 API Key（用於 WS 認證）
   * @returns {string} WebSocket URL
   */
  getScreenStreamWSUrl(androidId) {
    return `${WS_BASE}/api/v2/ws/screen/live/${androidId}?token=${this.token}`;
  }
}

export default new ApiService();