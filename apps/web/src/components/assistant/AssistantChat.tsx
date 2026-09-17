import { useState, type FormEvent } from 'react';
import { useAssistantInstruction, useIsReadOnly } from '../../realtime/collabContext';
import { useSpeechRecognition } from '../../realtime/useSpeechRecognition';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}

/**
 * Único punto de entrada de texto hacia el asistente de IA (Fase 5): no
 * aplica nada por sí mismo, solo manda la instrucción por el socket ya
 * abierto (useAssistantInstruction, en CollabProvider) y muestra la
 * respuesta. Los comandos resultantes ya se aplicaron al modelo antes de
 * que la promesa resuelva -- el canvas se actualiza solo.
 */
export function AssistantChat() {
  const sendInstruction = useAssistantInstruction();
  const readOnly = useIsReadOnly();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Fase 6: la voz solo llena el input, no manda nada sola. El usuario revisa
  // la transcripción y aprieta "Enviar" él mismo -- misma decisión que ya
  // tomamos para no ejecutar sin revisión una instrucción destructiva
  // (DELETE_CLASS, DELETE_RELATIONSHIP) que el reconocimiento haya escuchado mal.
  const speech = useSpeechRecognition({ onResult: (transcript) => setInput(transcript) });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const instruction = input.trim();
    if (!instruction || sending) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: instruction }]);
    setInput('');
    setSending(true);

    const result = await sendInstruction(instruction);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', text: result.message, isError: !result.ok },
    ]);
    setSending(false);
  };

  return (
    <aside className="assistant-chat">
      <header className="assistant-chat__header">Asistente</header>
      <ul className="assistant-chat__messages">
        {messages.length === 0 && (
          <li className="assistant-chat__empty">
            Probá: "Crear una clase Cliente" o "Agregar un atributo correo de tipo String a Cliente".
          </li>
        )}
        {messages.map((message) => (
          <li
            key={message.id}
            className={`assistant-chat__message assistant-chat__message--${message.role}${
              message.isError ? ' assistant-chat__message--error' : ''
            }`}
          >
            {message.text}
          </li>
        ))}
      </ul>
      {speech.error && <p className="assistant-chat__speech-error">{speech.error}</p>}
      <form className="assistant-chat__form" onSubmit={handleSubmit}>
        {speech.supported && (
          <button
            type="button"
            className={`assistant-chat__mic${speech.listening ? ' assistant-chat__mic--listening' : ''}`}
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={readOnly || sending}
            title={speech.listening ? 'Escuchando… (click para detener)' : 'Dictar instrucción por voz'}
            aria-label={speech.listening ? 'Detener dictado por voz' : 'Dictar instrucción por voz'}
          >
            🎤
          </button>
        )}
        <input
          type="text"
          placeholder={readOnly ? 'Solo lectura' : speech.listening ? 'Escuchando…' : 'Escribí una instrucción…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={readOnly || sending}
        />
        <button type="submit" disabled={readOnly || sending || !input.trim()}>
          {sending ? '…' : 'Enviar'}
        </button>
      </form>
    </aside>
  );
}
