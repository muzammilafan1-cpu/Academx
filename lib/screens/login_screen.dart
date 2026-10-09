import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'account_activation_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  final FirebaseAuth _auth = FirebaseAuth.instance;

  bool isLoading = false;
  bool obscurePassword = true;

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------

  Future<void> login() async {
    final email = emailController.text.trim();
    final password = passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showMessage('Please enter your email and password.');
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Do not navigate here.
      // AuthCheck in main.dart handles navigation
      // based on the user's role.
    } on FirebaseAuthException catch (e) {
      String message;

      switch (e.code) {
        case 'invalid-email':
          message = 'Please enter a valid email address.';
          break;

        case 'user-not-found':
        case 'wrong-password':
        case 'invalid-credential':
          message = 'Incorrect email or password.';
          break;

        case 'user-disabled':
          message = 'This account has been disabled.';
          break;

        case 'too-many-requests':
          message = 'Too many attempts. Please try again later.';
          break;

        default:
          message = e.message ?? 'Unable to sign in.';
      }

      _showMessage(message);
    } catch (e) {
      _showMessage('Something went wrong. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  // ------------------------------------------------------------
  // FORGOT PASSWORD
  // ------------------------------------------------------------

  Future<void> forgotPassword() async {
    final email = emailController.text.trim();

    if (email.isEmpty) {
      _showMessage('Enter your email first.');
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      await _auth.sendPasswordResetEmail(
        email: email,
      );

      if (!mounted) return;

      _showMessage(
        'If this email is registered, a password reset link has been sent.',
      );
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;

      if (e.code == 'invalid-email') {
        _showMessage('Please enter a valid email address.');
      } else {
        _showMessage(
          'If this email is registered, a password reset link has been sent.',
        );
      }
    } catch (e) {
      if (!mounted) return;

      _showMessage(
        'If this email is registered, a password reset link has been sent.',
      );
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  // ------------------------------------------------------------
  // ACCOUNT ACTIVATION
  // ------------------------------------------------------------

  void openAccountActivation() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const AccountActivationScreen(),
      ),
    );
  }

  // ------------------------------------------------------------
  // MESSAGE
  // ------------------------------------------------------------

  void _showMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  // ------------------------------------------------------------
  // DISPOSE
  // ------------------------------------------------------------

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 32,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: 420,
              ),
              child: _buildLoginContent(),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // LOGIN CONTENT
  // ------------------------------------------------------------

  Widget _buildLoginContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(),

        const SizedBox(height: 40),

        _buildEmailField(),

        const SizedBox(height: 20),

        _buildPasswordField(),

        const SizedBox(height: 8),

        _buildForgotPassword(),

        const SizedBox(height: 14),

        _buildLoginButton(),

        const SizedBox(height: 32),

        _buildActivationSection(),

        const SizedBox(height: 24),

        const Text(
          'Use the email registered with your institution.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: Colors.black45,
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // HEADER
  // ------------------------------------------------------------

  Widget _buildHeader() {
    return const Column(
      children: [
        Text(
          'Academx',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.8,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'Sign in to your institution',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 15,
            color: Colors.black54,
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // EMAIL
  // ------------------------------------------------------------

  Widget _buildEmailField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Email',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autocorrect: false,
          decoration: _inputDecoration(
            hintText: 'Enter your email',
            icon: Icons.email_outlined,
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // PASSWORD
  // ------------------------------------------------------------

  Widget _buildPasswordField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Password',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: passwordController,
          obscureText: obscurePassword,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!isLoading) {
              login();
            }
          },
          decoration: _inputDecoration(
            hintText: 'Enter your password',
            icon: Icons.lock_outline,
            suffixIcon: IconButton(
              onPressed: () {
                setState(() {
                  obscurePassword = !obscurePassword;
                });
              },
              icon: Icon(
                obscurePassword
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // FORGOT PASSWORD
  // ------------------------------------------------------------

  Widget _buildForgotPassword() {
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton(
        onPressed: isLoading ? null : forgotPassword,
        child: const Text(
          'Forgot password?',
          style: TextStyle(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // LOGIN BUTTON
  // ------------------------------------------------------------

  Widget _buildLoginButton() {
    return SizedBox(
      height: 54,
      child: ElevatedButton(
        onPressed: isLoading ? null : login,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1565C0),
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: isLoading
            ? const SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation<Color>(
              Colors.white,
            ),
          ),
        )
            : const Text(
          'Login',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // ACCOUNT ACTIVATION
  // ------------------------------------------------------------

  Widget _buildActivationSection() {
    return Column(
      children: [
        Row(
          children: const [
            Expanded(
              child: Divider(),
            ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'New to Academx?',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.black54,
                ),
              ),
            ),
            Expanded(
              child: Divider(),
            ),
          ],
        ),

        const SizedBox(height: 18),

        OutlinedButton(
          onPressed: isLoading
              ? null
              : openAccountActivation,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(
              double.infinity,
              52,
            ),
            side: const BorderSide(
              color: Color(0xFF1565C0),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: const Text(
            'Activate your account',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // INPUT DECORATION
  // ------------------------------------------------------------

  InputDecoration _inputDecoration({
    required String hintText,
    required IconData icon,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      hintText: hintText,
      prefixIcon: Icon(icon),
      suffixIcon: suffixIcon,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Color(0xFFE0E0E0),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Color(0xFF1565C0),
          width: 1.5,
        ),
      ),
    );
  }
}