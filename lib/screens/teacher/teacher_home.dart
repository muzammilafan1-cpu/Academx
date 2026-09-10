import 'package:flutter/material.dart';
import '../staff/staff_home.dart';

class TeacherHome extends StatelessWidget {
  const TeacherHome({super.key});

  @override
  Widget build(BuildContext context) {
    return const StaffHome(role: "teacher");
  }
}
