import { useState } from "react";
import "./LoginPage.css";
import { login } from "../controllers/authController";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/atoms/inputs";
import { Card } from "../components/molecules/card";
import { LogoMinWhiteText } from "../assets/logo";
import { Button } from "../components/molecules/button";
import { Validation } from "../types";
export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const success = await login(email, password);
    if (success) {
      setLoading(false);
      navigate("/dashboard");
    } else {
      setError("Invalid credentials. Please try again.");
    }
  };


  const emailValidations: Validation[] = [
    { rule: 'required', message: 'El correo electrónico es obligatorio' },
    { rule: 'email', message: 'Por favor, ingresa un correo electrónico válido' },
    { rule: 'noSQL', message: 'Entrada inválida' },
  ];
  
  const passwordValidations: Validation[] = [
    { rule: 'required', message: 'La contraseña es obligatoria' },
    { rule: 'minLength', value: 8, message: 'La contraseña debe tener al menos 8 caracteres' },
    { rule: 'noSQL', message: 'Entrada inválida' },
  ];
  

  return (
    <>
      <div className="login-container">
        <LogoMinWhiteText />
        <Card>
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-form__input__container">
              <Input
                type="text"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                validationRules={emailValidations}                
              />
            </div>
            <div className="login-form__input__container">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                validationRules={passwordValidations}
              />
            </div>
            <div className="login-form__input__container">
              <Button type="submit" disabled={loading} loading={loading}>
                Login
              </Button>
              {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};
