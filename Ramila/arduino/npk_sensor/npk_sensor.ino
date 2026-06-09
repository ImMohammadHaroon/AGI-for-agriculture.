#include <SoftwareSerial.h>

// Pin definitions
// Module RO → Arduino Pin 2 (RX)
// Module DI → Arduino Pin 3 (TX)
SoftwareSerial RS485(2, 3);

#define DE_RE_PIN 4

// Modbus RTU commands for NPK sensor (address 0x01)
const byte nitrogenCmd[]   = {0x01, 0x03, 0x00, 0x1E, 0x00, 0x01, 0xE4, 0x0C};
const byte phosphorusCmd[] = {0x01, 0x03, 0x00, 0x1F, 0x00, 0x01, 0xB5, 0xCC};
const byte potassiumCmd[]  = {0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xC0};

byte response[7];

void setup() {
  Serial.begin(9600);
  RS485.begin(4800);
  pinMode(DE_RE_PIN, OUTPUT);
  digitalWrite(DE_RE_PIN, LOW);
  delay(1000);
  Serial.println("=== NPK Soil Sensor Ready ===");
}

int readRegister(const byte* cmd, int cmdLen) {
  digitalWrite(DE_RE_PIN, HIGH);
  delayMicroseconds(200);
  for (int i = 0; i < cmdLen; i++) RS485.write(cmd[i]);
  RS485.flush();
  delayMicroseconds(200);
  digitalWrite(DE_RE_PIN, LOW);
  delay(300);

  memset(response, 0, sizeof(response));
  int index = 0;
  unsigned long deadline = millis() + 600;
  while (millis() < deadline && index < 7) {
    if (RS485.available()) response[index++] = RS485.read();
  }
  if (index == 7) return (response[3] << 8) | response[4];
  return -1;
}

void loop() {
  int N = readRegister(nitrogenCmd,   sizeof(nitrogenCmd));   delay(100);
  int P = readRegister(phosphorusCmd, sizeof(phosphorusCmd)); delay(100);
  int K = readRegister(potassiumCmd,  sizeof(potassiumCmd));

  Serial.println("======= Soil NPK Reading =======");
  if (N >= 0) { Serial.print("Nitrogen   (N): "); Serial.print(N); Serial.println(" mg/kg"); }
  else          Serial.println("Nitrogen   (N): ERROR - check wiring");

  if (P >= 0) { Serial.print("Phosphorus (P): "); Serial.print(P); Serial.println(" mg/kg"); }
  else          Serial.println("Phosphorus (P): ERROR - check wiring");

  if (K >= 0) { Serial.print("Potassium  (K): "); Serial.print(K); Serial.println(" mg/kg"); }
  else          Serial.println("Potassium  (K): ERROR - check wiring");

  Serial.println("================================");

  // Machine-readable line for the web app
  Serial.print("NPK_JSON:");
  Serial.print("{\"n\":"); Serial.print(N);
  Serial.print(",\"p\":"); Serial.print(P);
  Serial.print(",\"k\":"); Serial.print(K);
  Serial.print(",\"unit\":\"mg/kg\"}");
  Serial.println();

  delay(3000);
}