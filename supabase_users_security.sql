-- =====================================================
-- SEGURIDAD AVANZADA PARA GESTIÓN DE USUARIOS
-- =====================================================

-- 1. Asegurarnos que RLS esté activo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas viejas para no tener conflictos
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- 3. Política: Todos pueden leer su propio perfil
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 4. Política: Admins pueden ver TODOS los perfiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Política: Solo Admins pueden actualizar roles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
