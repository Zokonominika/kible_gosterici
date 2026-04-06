// Kabe'nin Koordinatları (Enlem, Boylam)
const KAABA_LAT = 21.422487;
const KAABA_LON = 39.826206;

// Service Worker Kaydı (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('ServiceWorker başarıyla kaydedildi: ', reg.scope);
        }).catch(err => {
            console.warn('ServiceWorker kaydı başarısız: ', err);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const compassScreen = document.getElementById('compass-screen');
    const errorMessage = document.getElementById('error-message');
    
    const locationInfo = document.getElementById('location-info');
    const compassDial = document.getElementById('compass-dial');
    const qiblaIndicator = document.getElementById('qibla-indicator');
    const statusText = document.getElementById('status-text');
    const debugInfo = document.getElementById('debug-info');
    const debugAlpha = document.getElementById('alpha-val');
    const debugQibla = document.getElementById('qibla-val');

    let userLat = null;
    let userLon = null;
    let qiblaBearing = 0;
    
    // Uygulamayı Başlat
    startBtn.addEventListener('click', async () => {
        errorMessage.classList.add('hidden');
        
        try {
            // 1. Pusula izni (iOS 13+ için özel izin isteği gerekir)
            await requestOrientationPermission();
            
            startBtn.textContent = 'Konum Bekleniyor...';
            
            // 2. Konum verisi
            const position = await getCurrentPosition();
            userLat = position.coords.latitude;
            userLon = position.coords.longitude;
            
            // Konum isim tahmini (Opsiyonel: Ters Geocode eklenebilir, şimdilik coords yazdırıyoruz)
            locationInfo.textContent = `Enlem: ${userLat.toFixed(2)}, Boylam: ${userLon.toFixed(2)}`;
            
            // 3. Kıble açısını hesapla
            qiblaBearing = calculateQibla(userLat, userLon, KAABA_LAT, KAABA_LON);
            
            debugQibla.textContent = Math.round(qiblaBearing);
            
            // Kıble göstergesini (Kabe simgesini) pusulanın içinde ilgili açıya yerleştir
            qiblaIndicator.style.transform = `rotate(${qiblaBearing}deg)`;
            
            // 4. Sensörü dinlemeye başla
            window.addEventListener('deviceorientation', handleOrientation, true);
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            
            // Arayüz geçişi
            startScreen.classList.add('hidden');
            setTimeout(() => {
                compassScreen.classList.remove('hidden');
            }, 300); // animasyon bekleme
            
        } catch (error) {
            startBtn.innerHTML = 'Pusulayı Başlat';
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
        }
    });

    // İzinler (iOS DeviceOrientation event için)
    async function requestOrientationPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState !== 'granted') {
                    throw new Error('Pusula izni reddedildi.');
                }
            } catch (error) {
                console.error(error);
                throw new Error('Pusula izni alınamadı: ' + error.message);
            }
        }
        return true;
    }

    // Konum API sarmalayıcı
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Tarayıcınız konum servisini desteklemiyor."));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(resolve, (err) => {
                let msg = "";
                switch(err.code) {
                    case err.PERMISSION_DENIED: msg = "Konum izni reddedildi."; break;
                    case err.POSITION_UNAVAILABLE: msg = "Konum bilgisi alınamıyor."; break;
                    case err.TIMEOUT: msg = "Konum isteği zaman aşımına uğradı."; break;
                    default: msg = "Bilinmeyen bir konum hatası oluştu.";
                }
                reject(new Error(msg));
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
    }

    // Kıble Hesaplama (Harversaform/Büyük Daire Formülü)
    function calculateQibla(latitude, longitude, kaabaLat, kaabaLon) {
        // Dereceleri radyana çevirme
        const toRad = deg => deg * Math.PI / 180;
        const toDeg = rad => rad * 180 / Math.PI;

        const phi1 = toRad(latitude);
        const phi2 = toRad(kaabaLat);
        const deltaLambda = toRad(kaabaLon - longitude);

        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) -
                  Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

        let theta = Math.atan2(y, x);
        let bearing = (toDeg(theta) + 360) % 360; // 0-360 arasına sınırla
        
        return bearing;
    }

    // Pusula okuma ve UI Rotasyonu
    // Bazı android tarayıcılar absoluteOrientation false olsa da webkitCompassHeading ile gerçek pusula verir (iOS)
    let compassSmoothing = [];
    
    function handleOrientation(event) {
        let alpha = null;

        // iOS için webkitCompassHeading
        if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
            alpha = event.webkitCompassHeading;
        } 
        // Android absolute event
        else if (event.absolute || event.type === 'deviceorientationabsolute') {
            // Android deviceorientation event return alpha based on Z axis rotation relative to North
            // Normal event.alpha is sometimes relative. For true north, we rely on absolute if available.
            // Android Chrome usually triggers deviceorientationabsolute.
            // alpha is [0, 360), 0 is North, increasing counter-clockwise.
            // Bu nedenle Pusula Yönü = 360 - event.alpha olur
            if (event.alpha !== null) {
               alpha = 360 - event.alpha; 
            }
        } 
        // Son çare (bazen çalışmaz çünkü relative olabilir)
        else if (event.alpha !== null && event.alpha !== undefined) {
             alpha = 360 - event.alpha;
        }

        if (alpha !== null) {
            // Basit bir pürüzsüzleştirme (Low-Pass Filter mantığı) eklenebilir. 
            // Direkt alpha kullanıldığında titreşim olur.
            // iOS'ta alpha direkt manyetik kuzeydir, dönüş saat yönündedir.
            
            debugAlpha.textContent = Math.round(alpha);
            
            // Pusula Kadrannı döndür. Kuzey üstte kalacak şekilde telefonu çevirdikçe kadranın döndüğünü göstermek için:
            // Kadranın dönüş açısı = -alpha olmalıdır.
            compassDial.style.transform = `rotate(${-alpha}deg)`;
            
            // Kullanıcının kabe yönünü dönüp dönmediğini kontrol etme
            // Telefondaki cihazın baktığı açı = alpha
            // Kıble açısı = qiblaBearing
            let diff = Math.abs((alpha - qiblaBearing + 360) % 360);
            if (diff > 180) diff = 360 - diff;
            
            if (diff < 3) {
                // 3 derece hassasiyetle hedefte
                statusText.innerHTML = "Doğru Yöndesiniz!";
                statusText.classList.add('status-aligned');
                
                // Titreşim bildirimi
                if (navigator.vibrate) {
                    // Yalnızca yeni hizalanıldığında bir kez titretmek için flag eklenebilir ama şu an için basit.
                }
            } else {
                statusText.innerHTML = "Cihazı çevirerek Kabe ikonu ile eşleşin";
                statusText.classList.remove('status-aligned');
            }
        } else {
            statusText.textContent = "Pusula verisi alınamıyor!";
        }
    }
});
